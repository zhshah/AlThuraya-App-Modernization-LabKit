using System;
using System.Configuration;
using System.Data;
using System.Data.SqlClient;
using System.Globalization;
using System.Threading.Tasks;

namespace ThurayaFinance.Portal.Data
{
    public static class Db
    {
        public static string ConnectionString => ConfigurationManager.ConnectionStrings["ThurayaFinanceDb"].ConnectionString;

        public static async Task<SqlConnection> OpenAsync()
        {
            var connection = new SqlConnection(ConnectionString);
            try
            {
                await connection.OpenAsync().ConfigureAwait(false);
                return connection;
            }
            catch
            {
                connection.Dispose();
                throw;
            }
        }

        public static SqlCommand Command(SqlConnection connection, SqlTransaction transaction, string sql)
        {
            return new SqlCommand(sql, connection, transaction) { CommandTimeout = 60 };
        }

        public static void Add(SqlCommand command, string name, SqlDbType type, object value, int size = 0)
        {
            var parameter = size > 0 ? command.Parameters.Add(name, type, size) : command.Parameters.Add(name, type);
            parameter.Value = value ?? DBNull.Value;
        }

        public static string Str(SqlDataReader reader, int ordinal) => reader.IsDBNull(ordinal) ? null : reader.GetString(ordinal);

        public static decimal? Dec(SqlDataReader reader, int ordinal) => reader.IsDBNull(ordinal) ? (decimal?)null : reader.GetDecimal(ordinal);

        public static int? Int(SqlDataReader reader, int ordinal) => reader.IsDBNull(ordinal) ? (int?)null : reader.GetInt32(ordinal);

        public static string Date(SqlDataReader reader, int ordinal) =>
            reader.IsDBNull(ordinal) ? null : reader.GetDateTime(ordinal).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

        /// <summary>Timestamps are stored in UTC (DATETIME2) and sent to the browser as ISO 8601 with a Z suffix.</summary>
        public static string Utc(SqlDataReader reader, int ordinal) => reader.IsDBNull(ordinal) ? null : FormatUtc(reader.GetDateTime(ordinal));

        public static string FormatUtc(DateTime value) =>
            DateTime.SpecifyKind(value, DateTimeKind.Utc).ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
    }
}
