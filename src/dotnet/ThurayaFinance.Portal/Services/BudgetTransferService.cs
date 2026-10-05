using System;
using System.Data;
using System.Globalization;
using System.Threading.Tasks;
using ThurayaFinance.Portal.Data;
using ThurayaFinance.Portal.Infrastructure;
using ThurayaFinance.Portal.Models;

namespace ThurayaFinance.Portal.Services
{
    /// <summary>Budget transfer requests between cost centres; they are routed to the Group CFO for approval.</summary>
    public class BudgetTransferService
    {
        public async Task<TransferResult> CreateAsync(BudgetTransferRequest request)
        {
            var from = (request.From ?? string.Empty).Trim();
            var to = (request.To ?? string.Empty).Trim();
            var justification = (request.Justification ?? string.Empty).Trim();
            var amount = request.Amount.HasValue ? Math.Round(request.Amount.Value, 2, MidpointRounding.AwayFromZero) : 0m;
            if (from.Length == 0 || to.Length == 0 || from == to || amount <= 0 || amount > 999999999.99m || justification.Length == 0 || justification.Length > 400)
            {
                throw ApiException.BadRequest("VALIDATION", "Choose two different cost centres, an amount and a justification.");
            }

            using (var connection = await Db.OpenAsync().ConfigureAwait(false))
            using (var transaction = connection.BeginTransaction(IsolationLevel.ReadCommitted))
            {
                var settings = await FinanceRepository.GetSettingsAsync(connection, transaction).ConfigureAwait(false);
                using (var command = Db.Command(connection, transaction, "SELECT COUNT(*) FROM dbo.cost_centre WHERE cost_centre_id IN (@from, @to);"))
                {
                    Db.Add(command, "@from", SqlDbType.NVarChar, from, 10);
                    Db.Add(command, "@to", SqlDbType.NVarChar, to, 10);
                    if ((int)await command.ExecuteScalarAsync().ConfigureAwait(false) != 2)
                    {
                        throw ApiException.BadRequest("VALIDATION", "Unknown cost centre.");
                    }
                }
                int sequence;
                using (var command = Db.Command(connection, transaction, "SELECT NEXT VALUE FOR dbo.budget_transfer_seq;"))
                {
                    sequence = (int)await command.ExecuteScalarAsync().ConfigureAwait(false);
                }
                var reference = "BT-" + settings["fiscal_year"] + "-" + sequence.ToString("000", CultureInfo.InvariantCulture);

                await FinanceRepository.ExecuteAsync(connection, transaction, @"
INSERT INTO dbo.budget_transfer (transfer_ref, from_cc, to_cc, amount, justification, requested_by, requested_at, status)
VALUES (@ref, @from, @to, @amount, @justification, @by, SYSUTCDATETIME(), N'submitted');", c =>
                {
                    Db.Add(c, "@ref", SqlDbType.NVarChar, reference, 20);
                    Db.Add(c, "@from", SqlDbType.NVarChar, from, 10);
                    Db.Add(c, "@to", SqlDbType.NVarChar, to, 10);
                    var parameter = c.Parameters.Add("@amount", SqlDbType.Decimal);
                    parameter.Precision = 18;
                    parameter.Scale = 2;
                    parameter.Value = amount;
                    Db.Add(c, "@justification", SqlDbType.NVarChar, justification, 400);
                    Db.Add(c, "@by", SqlDbType.NVarChar, settings["persona_id"], 20);
                }).ConfigureAwait(false);

                var result = new TransferResult
                {
                    Transfer = await FinanceRepository.LoadTransferAsync(connection, transaction, reference).ConfigureAwait(false),
                    Audit = await FinanceRepository.InsertAuditAsync(connection, transaction, settings, "transfer", "budget", reference).ConfigureAwait(false)
                };
                transaction.Commit();
                PortalLog.Info(string.Format(CultureInfo.InvariantCulture, "Budget transfer {0} submitted: {1} -> {2}, QAR {3:N2}", reference, from, to, amount));
                return result;
            }
        }
    }
}
