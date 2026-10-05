using System;
using System.Collections.Generic;
using System.Data;
using System.Data.SqlClient;
using System.Net;
using System.Threading.Tasks;
using ThurayaFinance.Portal.Data;
using ThurayaFinance.Portal.Infrastructure;
using ThurayaFinance.Portal.Models;

namespace ThurayaFinance.Portal.Services
{
    /// <summary>
    /// Approve / reject items routed to the Group Financial Controller under the Delegation of Authority.
    /// Supplier invoices move along their approval chain in ThurayaFinance; payment-run releases are recorded by the
    /// treasury service; every decision is written to the audit trail and e-mailed to the requester.
    /// </summary>
    public class ApprovalService
    {
        internal const string RejectionPrefixEn = "Rejected by Financial Controller";
        internal const string RejectionPrefixAr = "\u0631\u064F\u0641\u0636\u062A \u0645\u0646 \u0627\u0644\u0645\u0631\u0627\u0642\u0628 \u0627\u0644\u0645\u0627\u0644\u064A";

        private readonly TreasuryServiceClient _treasury = new TreasuryServiceClient();
        private readonly EmailNotifier _email = new EmailNotifier();

        public async Task<DecisionResult> DecideAsync(string approvalId, string decision, string comment)
        {
            if (decision != "approve" && decision != "reject")
            {
                throw ApiException.BadRequest("VALIDATION", "The decision must be 'approve' or 'reject'.");
            }
            comment = string.IsNullOrWhiteSpace(comment) ? null : comment.Trim();
            if (comment != null && comment.Length > 500)
            {
                throw ApiException.BadRequest("VALIDATION", "The comment can have at most 500 characters.");
            }
            var approve = decision == "approve";
            if (!approve && comment == null)
            {
                throw ApiException.BadRequest("COMMENT_REQUIRED", "A reason is required to reject.");
            }

            var result = new DecisionResult();
            string type, reference, requestedBy;
            using (var connection = await Db.OpenAsync().ConfigureAwait(false))
            using (var transaction = connection.BeginTransaction(IsolationLevel.ReadCommitted))
            {
                var settings = await FinanceRepository.GetSettingsAsync(connection, transaction).ConfigureAwait(false);
                string status, vendorId;
                using (var command = Db.Command(connection, transaction,
                    "SELECT request_type, ref, status, requested_by, vendor_id FROM dbo.approval_request WITH (UPDLOCK, ROWLOCK) WHERE approval_id = @id;"))
                {
                    Db.Add(command, "@id", SqlDbType.NVarChar, approvalId, 30);
                    using (var reader = await command.ExecuteReaderAsync().ConfigureAwait(false))
                    {
                        if (!await reader.ReadAsync().ConfigureAwait(false))
                        {
                            throw ApiException.NotFound("Approval request " + approvalId + " does not exist.");
                        }
                        type = reader.GetString(0);
                        reference = reader.GetString(1);
                        status = reader.GetString(2);
                        requestedBy = reader.GetString(3);
                        vendorId = Db.Str(reader, 4);
                    }
                }
                if (status != "open")
                {
                    throw ApiException.Conflict("ALREADY_DECIDED", "Approval request " + approvalId + " was already " + status + ".");
                }

                switch (type)
                {
                    case "invoice":
                        result.Invoice = await DecideInvoiceAsync(connection, transaction, reference, approve, comment, settings["as_of_date"]).ConfigureAwait(false);
                        break;
                    case "run":
                        result.Run = await DecideRunAsync(reference, decision, settings["persona_id"], comment).ConfigureAwait(false);
                        break;
                    case "vendor":
                        if (approve)
                        {
                            await FinanceRepository.ExecuteAsync(connection, transaction, "UPDATE dbo.vendor SET status = N'active' WHERE vendor_id = @id;",
                                c => Db.Add(c, "@id", SqlDbType.NVarChar, vendorId, 10)).ConfigureAwait(false);
                        }
                        result.Vendor = new VendorStatusDto { Id = vendorId, Status = approve ? "active" : "review" };
                        break;
                    case "budget":
                        await FinanceRepository.ExecuteAsync(connection, transaction,
                            "UPDATE dbo.budget_transfer SET status = @status, decided_at = SYSUTCDATETIME() WHERE transfer_ref = @ref;",
                            c =>
                            {
                                Db.Add(c, "@status", SqlDbType.NVarChar, approve ? "approved" : "rejected", 10);
                                Db.Add(c, "@ref", SqlDbType.NVarChar, reference, 20);
                            }).ConfigureAwait(false);
                        result.Transfer = await FinanceRepository.LoadTransferAsync(connection, transaction, reference).ConfigureAwait(false);
                        break;
                }

                await FinanceRepository.ExecuteAsync(connection, transaction, @"
UPDATE dbo.approval_request
SET status = @status, decided_at = SYSUTCDATETIME(), decided_by = @by, decision_comment = @comment
WHERE approval_id = @id;", c =>
                {
                    Db.Add(c, "@status", SqlDbType.NVarChar, approve ? "approved" : "rejected", 10);
                    Db.Add(c, "@by", SqlDbType.NVarChar, settings["persona_id"], 20);
                    Db.Add(c, "@comment", SqlDbType.NVarChar, comment, 500);
                    Db.Add(c, "@id", SqlDbType.NVarChar, approvalId, 30);
                }).ConfigureAwait(false);
                result.Audit = await FinanceRepository.InsertAuditAsync(connection, transaction, settings, decision, type, reference).ConfigureAwait(false);
                transaction.Commit();
            }

            PortalLog.Info(string.Format("Approval {0} ({1} {2}) {3}", approvalId, type, reference, approve ? "approved" : "rejected"));
            _email.SendDecision(requestedBy, type, reference, approve, comment);
            return result;
        }

        private static async Task<InvoiceDto> DecideInvoiceAsync(SqlConnection connection, SqlTransaction transaction, string invoiceId, bool approve, string comment, string asOfDate)
        {
            var steps = new List<Tuple<int, string>>();
            using (var command = Db.Command(connection, transaction,
                "SELECT step_no, status FROM dbo.invoice_approval_step WITH (UPDLOCK) WHERE invoice_id = @id ORDER BY step_no;"))
            {
                Db.Add(command, "@id", SqlDbType.NVarChar, invoiceId, 20);
                using (var reader = await command.ExecuteReaderAsync().ConfigureAwait(false))
                {
                    while (await reader.ReadAsync().ConfigureAwait(false)) steps.Add(Tuple.Create(reader.GetInt32(0), reader.GetString(1)));
                }
            }
            var current = steps.FindIndex(s => s.Item2 == "current");
            if (current < 0)
            {
                throw ApiException.Conflict("INVALID_STATE", "Invoice " + invoiceId + " is not waiting for an approval.");
            }
            var stepNo = steps[current].Item1;

            Action<SqlCommand> keys = c =>
            {
                Db.Add(c, "@id", SqlDbType.NVarChar, invoiceId, 20);
                Db.Add(c, "@step", SqlDbType.Int, stepNo);
                Db.Add(c, "@comment", SqlDbType.NVarChar, comment, 500);
            };
            if (approve)
            {
                await FinanceRepository.ExecuteAsync(connection, transaction,
                    "UPDATE dbo.invoice_approval_step SET status = N'done', acted_at = SYSUTCDATETIME(), comment = @comment WHERE invoice_id = @id AND step_no = @step;", keys).ConfigureAwait(false);
                if (current + 1 < steps.Count)
                {
                    await FinanceRepository.ExecuteAsync(connection, transaction,
                        "UPDATE dbo.invoice_approval_step SET status = N'current', since_date = @since WHERE invoice_id = @id AND step_no = @next;", c =>
                        {
                            Db.Add(c, "@since", SqlDbType.Date, DateTime.Parse(asOfDate, System.Globalization.CultureInfo.InvariantCulture));
                            Db.Add(c, "@id", SqlDbType.NVarChar, invoiceId, 20);
                            Db.Add(c, "@next", SqlDbType.Int, steps[current + 1].Item1);
                        }).ConfigureAwait(false);
                }
                else
                {
                    await FinanceRepository.ExecuteAsync(connection, transaction,
                        "UPDATE dbo.invoice SET status = N'approved' WHERE invoice_id = @id;", c => Db.Add(c, "@id", SqlDbType.NVarChar, invoiceId, 20)).ConfigureAwait(false);
                }
            }
            else
            {
                await FinanceRepository.ExecuteAsync(connection, transaction,
                    "UPDATE dbo.invoice_approval_step SET status = N'rejected', acted_at = SYSUTCDATETIME(), comment = @comment WHERE invoice_id = @id AND step_no = @step;", keys).ConfigureAwait(false);
                await FinanceRepository.ExecuteAsync(connection, transaction, @"
UPDATE dbo.invoice
SET prev_status = status, status = N'hold', hold_reason_en = @en, hold_reason_ar = @ar
WHERE invoice_id = @id;", c =>
                {
                    Db.Add(c, "@en", SqlDbType.NVarChar, RejectionPrefixEn + ": " + comment, 600);
                    Db.Add(c, "@ar", SqlDbType.NVarChar, RejectionPrefixAr + ": " + comment, 600);
                    Db.Add(c, "@id", SqlDbType.NVarChar, invoiceId, 20);
                }).ConfigureAwait(false);
            }
            return await InvoiceSql.LoadAsync(connection, transaction, invoiceId).ConfigureAwait(false);
        }

        /// <summary>
        /// The first approval of a payment run is recorded by the treasury service. If an earlier attempt already reached the
        /// treasury service (and only the portal's update failed), the same decision is accepted so a retry completes.
        /// </summary>
        private async Task<PaymentRunDto> DecideRunAsync(string runId, string decision, string approverId, string comment)
        {
            try
            {
                return await _treasury.DecideRunAsync(runId, decision, approverId, comment).ConfigureAwait(false);
            }
            catch (TreasuryServiceException ex) when (ex.StatusCode == HttpStatusCode.Conflict)
            {
                PaymentRunDto run;
                try
                {
                    run = await _treasury.GetPaymentRunAsync(runId).ConfigureAwait(false);
                }
                catch (TreasuryServiceException)
                {
                    throw new ApiException(502, "TREASURY_UNAVAILABLE", ex.Message, ex);
                }
                if (run.Decision != null && run.Decision.Decision == decision && run.Decision.By == approverId)
                {
                    return run;
                }
                throw ApiException.Conflict("ALREADY_DECIDED", ex.Message);
            }
            catch (TreasuryServiceException ex)
            {
                throw new ApiException(502, "TREASURY_UNAVAILABLE", ex.Message, ex);
            }
        }
    }
}
