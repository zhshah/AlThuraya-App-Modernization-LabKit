using System.Web.Mvc;

namespace ThurayaFinance.Portal.Infrastructure
{
    /// <summary>Logs every unhandled exception before the standard error handling runs.</summary>
    public class LogExceptionFilter : IExceptionFilter
    {
        public void OnException(ExceptionContext filterContext)
        {
            if (filterContext.Exception is ApiException)
            {
                return;
            }
            var request = filterContext.HttpContext.Request;
            PortalLog.Error("Unhandled exception for " + request.HttpMethod + " " + request.RawUrl, filterContext.Exception);
        }
    }
}
