using System.Collections.Generic;
using System.Data;
using System.Data.SqlClient;
using System.Threading.Tasks;
using ThurayaFinance.Portal.Models;

namespace ThurayaFinance.Portal.Data
{
    /// <summary>Column lists and mappers for supplier invoices, shared by the full data load and single-invoice reloads.</summary>
    internal static class InvoiceSql
    {
        public const string Columns =
            "invoice_id, vendor_ref, vendor_id, entity_id, cost_centre_id, category_key, po_number, grn, invoice_date, received_date, due_date, " +
            "payment_terms, currency, amount, fx_rate, amount_qar, status, match_status, paid_date, payment_run_id, hold_reason_en, hold_reason_ar, prev_status";

        public const string LineColumns = "invoice_id, description, qty, unit_price, amount";

        public const string StepColumns = "invoice_id, role_code, approver_id, status, acted_at, since_date, comment";

        public static InvoiceDto Read(SqlDataReader r)
        {
            var holdEn = Db.Str(r, 20);
            return new InvoiceDto
            {
                Id = r.GetString(0),
                VendorRef = r.GetString(1),
                VendorId = r.GetString(2),
                EntityId = r.GetString(3),
                CcId = r.GetString(4),
                Category = r.GetString(5),
                PoNumber = Db.Str(r, 6),
                Grn = Db.Str(r, 7),
                InvoiceDate = Db.Date(r, 8),
                Received = Db.Date(r, 9),
                DueDate = Db.Date(r, 10),
                Terms = r.GetInt32(11),
                Currency = r.GetString(12),
                Amount = r.GetDecimal(13),
                FxRate = r.GetDecimal(14),
                AmountQar = r.GetDecimal(15),
                Status = r.GetString(16),
                Match = r.GetString(17),
                PaidDate = Db.Date(r, 18),
                PaymentRun = Db.Str(r, 19),
                HoldReason = holdEn == null ? null : new[] { holdEn, Db.Str(r, 21) ?? holdEn },
                PrevStatus = Db.Str(r, 22),
                Lines = new List<InvoiceLineDto>(),
                Chain = new List<ChainStepDto>()
            };
        }

        public static InvoiceLineDto ReadLine(SqlDataReader r) => new InvoiceLineDto
        {
            Desc = r.GetString(1),
            Qty = r.GetInt32(2),
            Unit = r.GetDecimal(3),
            Amount = r.GetDecimal(4)
        };

        public static ChainStepDto ReadStep(SqlDataReader r) => new ChainStepDto
        {
            Role = r.GetString(1),
            Approver = r.GetString(2),
            Status = r.GetString(3),
            At = Db.Utc(r, 4),
            Since = Db.Date(r, 5),
            Comment = Db.Str(r, 6)
        };

        public static async Task<InvoiceDto> LoadAsync(SqlConnection connection, SqlTransaction transaction, string invoiceId)
        {
            var sql = "SELECT " + Columns + " FROM dbo.invoice WHERE invoice_id = @id;" +
                      "SELECT " + LineColumns + " FROM dbo.invoice_line WHERE invoice_id = @id ORDER BY line_no;" +
                      "SELECT " + StepColumns + " FROM dbo.invoice_approval_step WHERE invoice_id = @id ORDER BY step_no;";
            using (var command = Db.Command(connection, transaction, sql))
            {
                Db.Add(command, "@id", SqlDbType.NVarChar, invoiceId, 20);
                using (var reader = await command.ExecuteReaderAsync().ConfigureAwait(false))
                {
                    if (!await reader.ReadAsync().ConfigureAwait(false))
                    {
                        return null;
                    }
                    var invoice = Read(reader);
                    await reader.NextResultAsync().ConfigureAwait(false);
                    while (await reader.ReadAsync().ConfigureAwait(false))
                    {
                        invoice.Lines.Add(ReadLine(reader));
                    }
                    await reader.NextResultAsync().ConfigureAwait(false);
                    while (await reader.ReadAsync().ConfigureAwait(false))
                    {
                        invoice.Chain.Add(ReadStep(reader));
                    }
                    return invoice;
                }
            }
        }
    }
}
