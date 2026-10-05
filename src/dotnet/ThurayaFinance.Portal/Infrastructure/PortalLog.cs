using System;
using System.Diagnostics;
using System.Threading;

namespace ThurayaFinance.Portal.Infrastructure
{
    /// <summary>Trace log on the server's local disk (see system.diagnostics in Web.config) plus the Windows Application event log for errors.</summary>
    public static class PortalLog
    {
        public const string EventSource = "ThurayaFinance.Portal";

        public static void Info(string message) => Write("INFO ", message, null);

        public static void Warn(string message) => Write("WARN ", message, null);

        public static void Error(string message, Exception exception)
        {
            Write("ERROR", message, exception);
            try
            {
                EventLog.WriteEntry(EventSource, message + Environment.NewLine + exception, EventLogEntryType.Error);
            }
            catch (Exception)
            {
                // The event source is created by the deployment; never fail a request because of logging.
            }
        }

        private static void Write(string level, string message, Exception exception)
        {
            Trace.WriteLine(string.Format("{0:yyyy-MM-dd HH:mm:ss.fff} {1} [{2}] {3}{4}", DateTime.Now, level, Thread.CurrentThread.ManagedThreadId, message,
                exception == null ? string.Empty : Environment.NewLine + exception));
        }
    }
}
