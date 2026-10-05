using System;
using System.Collections.Generic;
using System.Data;
using System.Data.SqlClient;
using System.Threading.Tasks;
using ThurayaFinance.Portal.Models;

namespace ThurayaFinance.Portal.Data
{
    /// <summary>Shared reads and writes used inside the portal's database transactions.</summary>
    public static class FinanceRepository
    {
        public const string TransferColumns = "transfer_ref, from_cc, to_cc, amount, justification, requested_by, requested_at, status";

        public static async Task<IDictionary<string, string>> GetSettingsAsync(SqlConnection connection, SqlTransaction transaction)
        {
            var settings = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            using (var command = Db.Command(connection, transaction, "SELECT setting_key, setting_value FROM dbo.app_setting;"))
            using (var reader = await command.ExecuteReaderAsync().ConfigureAwait(false))
            {
                while (await reader.ReadAsync().ConfigureAwait(false)) settings[reader.GetString(0)] = reader.GetString(1);
            }
            if (!settings.ContainsKey("persona_id"))
            {
                throw new InvalidOperationException("The ThurayaFinance database has no data - run the deployment to load the demonstration dataset.");
            }
            return settings;
        }

        /// <summary>Writes an audit-trail entry for the signed-in user (the persona) and returns it as the UI shows it.</summary>
        public static async Task<AuditDto> InsertAuditAsync(SqlConnection connection, SqlTransaction transaction, IDictionary<string, string> settings,
            string action, string objectType, string reference, string outcome = "success")
        {
            const string sql = @"
INSERT INTO dbo.audit_log (event_at, user_id, action, object_type, ref, source_ip, outcome)
OUTPUT INSERTED.event_at
VALUES (SYSUTCDATETIME(), @user, @action, @object, @ref, @ip, @outcome);";
            using (var command = Db.Command(connection, transaction, sql))
            {
                Db.Add(command, "@user", SqlDbType.NVarChar, settings["persona_id"], 20);
                Db.Add(command, "@action", SqlDbType.NVarChar, action, 20);
                Db.Add(command, "@object", SqlDbType.NVarChar, objectType, 20);
                Db.Add(command, "@ref", SqlDbType.NVarChar, reference, 60);
                Db.Add(command, "@ip", SqlDbType.NVarChar, settings["persona_ip"], 45);
                Db.Add(command, "@outcome", SqlDbType.NVarChar, outcome, 10);
                var at = (DateTime)await command.ExecuteScalarAsync().ConfigureAwait(false);
                return new AuditDto
                {
                    At = Db.FormatUtc(at),
                    User = settings["persona_id"],
                    Action = action,
                    ObjectType = objectType,
                    Ref = reference,
                    Ip = settings["persona_ip"],
                    Outcome = outcome
                };
            }
        }

        public static BudgetTransferDto ReadTransfer(SqlDataReader r) => new BudgetTransferDto
        {
            Ref = r.GetString(0),
            From = r.GetString(1),
            To = r.GetString(2),
            Amount = r.GetDecimal(3),
            Justification = r.GetString(4),
            RequestedBy = r.GetString(5),
            RequestedAt = Db.Utc(r, 6),
            Status = r.GetString(7)
        };

        public static async Task<BudgetTransferDto> LoadTransferAsync(SqlConnection connection, SqlTransaction transaction, string reference)
        {
            using (var command = Db.Command(connection, transaction, "SELECT " + TransferColumns + " FROM dbo.budget_transfer WHERE transfer_ref = @ref;"))
            {
                Db.Add(command, "@ref", SqlDbType.NVarChar, reference, 20);
                using (var reader = await command.ExecuteReaderAsync().ConfigureAwait(false))
                {
                    return await reader.ReadAsync().ConfigureAwait(false) ? ReadTransfer(reader) : null;
                }
            }
        }

        public static async Task<int> ExecuteAsync(SqlConnection connection, SqlTransaction transaction, string sql, Action<SqlCommand> parameters)
        {
            using (var command = Db.Command(connection, transaction, sql))
            {
                parameters(command);
                return await command.ExecuteNonQueryAsync().ConfigureAwait(false);
            }
        }
    }
}
