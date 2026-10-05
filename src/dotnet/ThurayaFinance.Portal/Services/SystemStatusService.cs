using System;
using System.Collections.Generic;
using System.Data.SqlClient;
using System.Security.Principal;
using System.Threading.Tasks;
using System.Web;
using Microsoft.Win32;
using ThurayaFinance.Portal.Data;
using ThurayaFinance.Portal.Infrastructure;
using ThurayaFinance.Portal.Models;

namespace ThurayaFinance.Portal.Services
{
    /// <summary>Health checks and "where is this running" facts for the About dialog and /health.</summary>
    public class SystemStatusService
    {
        private static readonly object CacheLock = new object();
        private static PlatformInfo cachedPlatform;
        private static DateTime cachedAt = DateTime.MinValue;

        public async Task<PlatformInfo> GetPlatformAsync()
        {
            lock (CacheLock)
            {
                if (cachedPlatform != null && DateTime.UtcNow - cachedAt < TimeSpan.FromMinutes(5))
                {
                    return cachedPlatform;
                }
            }
            var platform = new PlatformInfo
            {
                Server = Environment.MachineName,
                WebServer = WebServerName(),
                Runtime = ".NET Framework " + FrameworkVersion() + " / ASP.NET MVC " + typeof(System.Web.Mvc.Controller).Assembly.GetName().Version.ToString(3),
                AppPoolIdentity = WindowsIdentity.GetCurrent().Name,
                Database = await DatabaseVersionAsync().ConfigureAwait(false),
                Treasury = await TreasuryDescriptionAsync().ConfigureAwait(false)
            };
            lock (CacheLock)
            {
                cachedPlatform = platform;
                cachedAt = DateTime.UtcNow;
            }
            return platform;
        }

        public async Task<IDictionary<string, object>> CheckHealthAsync()
        {
            var checks = new Dictionary<string, object>();
            var databaseUp = false;
            var treasuryUp = false;
            try
            {
                using (var connection = await Db.OpenAsync().ConfigureAwait(false))
                using (var command = Db.Command(connection, null,
                    "SELECT (SELECT COUNT(*) FROM dbo.invoice), (SELECT COUNT(*) FROM dbo.receivable), (SELECT COUNT(*) FROM dbo.approval_request WHERE status = N'open'), (SELECT COUNT(*) FROM dbo.audit_log);"))
                using (var reader = await command.ExecuteReaderAsync().ConfigureAwait(false))
                {
                    await reader.ReadAsync().ConfigureAwait(false);
                    checks["database"] = new
                    {
                        status = "Up",
                        detail = string.Format("{0} invoices, {1} receivables, {2} open approvals, {3} audit entries", reader.GetInt32(0), reader.GetInt32(1), reader.GetInt32(2), reader.GetInt32(3))
                    };
                    databaseUp = reader.GetInt32(0) > 0;
                }
            }
            catch (Exception ex) when (ex is SqlException || ex is InvalidOperationException)
            {
                checks["database"] = new { status = "Down", detail = ex.Message };
            }
            try
            {
                var status = await new TreasuryServiceClient().GetStatusAsync().ConfigureAwait(false);
                treasuryUp = status.DatabaseStatus == "UP";
                checks["treasuryService"] = new { status = treasuryUp ? "Up" : "Degraded", detail = TreasuryServiceClient.BaseUrl + " - " + Describe(status) };
            }
            catch (TreasuryServiceException ex)
            {
                checks["treasuryService"] = new { status = "Down", detail = ex.Message };
            }
            return new Dictionary<string, object>
            {
                { "status", databaseUp && treasuryUp ? "Healthy" : databaseUp ? "Degraded" : "Unhealthy" },
                { "server", new { machineName = Environment.MachineName, webServer = WebServerName(), dotNetFramework = ".NET Framework " + FrameworkVersion(), appPoolIdentity = WindowsIdentity.GetCurrent().Name } },
                { "checks", checks },
                { "time", DateTime.UtcNow.ToString("o") }
            };
        }

        private static string WebServerName()
        {
            // HttpRuntime works after ConfigureAwait(false), where HttpContext.Current is null.
            var version = HttpRuntime.IISVersion;
            return version == null ? "IIS" : "IIS " + version.ToString(2);
        }

        private static string FrameworkVersion()
        {
            using (var key = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full"))
            {
                var release = key == null ? 0 : Convert.ToInt32(key.GetValue("Release", 0));
                return release >= 533320 ? "4.8.1" : release >= 528040 ? "4.8" : release >= 461808 ? "4.7.2" : "4.x";
            }
        }

        private static async Task<string> DatabaseVersionAsync()
        {
            try
            {
                using (var connection = await Db.OpenAsync().ConfigureAwait(false))
                using (var command = Db.Command(connection, null,
                    "SELECT N'SQL Server ' + CAST(SERVERPROPERTY('ProductVersion') AS NVARCHAR(50)) + N' ' + CAST(SERVERPROPERTY('Edition') AS NVARCHAR(100)) + N' (' + @@SERVERNAME + N')';"))
                {
                    return (string)await command.ExecuteScalarAsync().ConfigureAwait(false);
                }
            }
            catch (SqlException ex)
            {
                return "unavailable (" + ex.Message + ")";
            }
        }

        private static async Task<string> TreasuryDescriptionAsync()
        {
            try
            {
                return Describe(await new TreasuryServiceClient().GetStatusAsync().ConfigureAwait(false));
            }
            catch (TreasuryServiceException ex)
            {
                PortalLog.Warn("Treasury service status unavailable: " + ex.Message);
                return "unavailable";
            }
        }

        private static string Describe(TreasuryStatusDto status) =>
            "Java " + status.JavaVersion + " / Spring Boot " + status.SpringBootVersion + " / " + status.Server;
    }
}
