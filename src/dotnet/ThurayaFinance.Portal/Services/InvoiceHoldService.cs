using System.Data;
using System.Threading.Tasks;
using ThurayaFinance.Portal.Data;
using ThurayaFinance.Portal.Infrastructure;
using ThurayaFinance.Portal.Models;

namespace ThurayaFinance.Portal.Services
{
    /// <summary>Puts an approved or scheduled supplier invoice on hold, or releases the hold.</summary>
    public class InvoiceHoldService
    {
        internal const string HoldManualEn = "Placed on hold by Financial Controller";
        internal const string HoldManualAr = "\u0639\u064F\u0644\u0651\u0642\u062A \u0645\u0646 \u0627\u0644\u0645\u0631\u0627\u0642\u0628 \u0627\u0644\u0645\u0627\u0644\u064A";

        public async Task<InvoiceResult> SetHoldAsync(string invoiceId, bool hold)
        {
            using (var connection = await Db.OpenAsync().ConfigureAwait(false))
            using (var transaction = connection.BeginTransaction(IsolationLevel.ReadCommitted))
            {
                var settings = await FinanceRepository.GetSettingsAsync(connection, transaction).ConfigureAwait(false);
                string status;
                using (var command = Db.Command(connection, transaction, "SELECT status FROM dbo.invoice WITH (UPDLOCK, ROWLOCK) WHERE invoice_id = @id;"))
                {
                    Db.Add(command, "@id", SqlDbType.NVarChar, invoiceId, 20);
                    status = (string)await command.ExecuteScalarAsync().ConfigureAwait(false);
                }
                if (status == null)
                {
                    throw ApiException.NotFound("Invoice " + invoiceId + " does not exist.");
                }

                if (hold)
                {
                    if (status != "approved" && status != "scheduled")
                    {
                        throw ApiException.Conflict("INVALID_STATE", "Invoice " + invoiceId + " is " + status + " and cannot be put on hold.");
                    }
                    await FinanceRepository.ExecuteAsync(connection, transaction, @"
UPDATE dbo.invoice SET prev_status = status, status = N'hold', hold_reason_en = @en, hold_reason_ar = @ar WHERE invoice_id = @id;", c =>
                    {
                        Db.Add(c, "@en", SqlDbType.NVarChar, HoldManualEn, 600);
                        Db.Add(c, "@ar", SqlDbType.NVarChar, HoldManualAr, 600);
                        Db.Add(c, "@id", SqlDbType.NVarChar, invoiceId, 20);
                    }).ConfigureAwait(false);
                }
                else
                {
                    if (status != "hold")
                    {
                        throw ApiException.Conflict("INVALID_STATE", "Invoice " + invoiceId + " is not on hold.");
                    }
                    await FinanceRepository.ExecuteAsync(connection, transaction, @"
UPDATE dbo.invoice
SET status = CASE WHEN prev_status IS NOT NULL AND prev_status <> N'hold' THEN prev_status ELSE N'approved' END,
    hold_reason_en = NULL, hold_reason_ar = NULL
WHERE invoice_id = @id;", c => Db.Add(c, "@id", SqlDbType.NVarChar, invoiceId, 20)).ConfigureAwait(false);
                }

                var result = new InvoiceResult
                {
                    Audit = await FinanceRepository.InsertAuditAsync(connection, transaction, settings, hold ? "hold" : "update", "invoice", invoiceId).ConfigureAwait(false),
                    Invoice = await InvoiceSql.LoadAsync(connection, transaction, invoiceId).ConfigureAwait(false)
                };
                transaction.Commit();
                PortalLog.Info("Invoice " + invoiceId + (hold ? " put on hold" : " released from hold"));
                return result;
            }
        }
    }
}
