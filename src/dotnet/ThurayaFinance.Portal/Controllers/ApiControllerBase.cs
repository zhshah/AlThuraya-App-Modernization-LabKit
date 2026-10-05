using System.Web.Mvc;
using ThurayaFinance.Portal.Infrastructure;

namespace ThurayaFinance.Portal.Controllers
{
    /// <summary>Base class for the portal's JSON endpoints: every failure is returned as { error: { code, message } }.</summary>
    public abstract class ApiControllerBase : Controller
    {
        protected static JsonNetResult JsonNet(object data, int statusCode = 200) => new JsonNetResult(data, statusCode);

        protected override void OnException(ExceptionContext filterContext)
        {
            var api = filterContext.Exception as ApiException;
            if (api != null && api.StatusCode >= 500)
            {
                PortalLog.Warn(api.Code + " for " + Request.HttpMethod + " " + Request.RawUrl + ": " + api.Message);
            }
            filterContext.Result = api != null
                ? JsonNet(new { error = new { code = api.Code, message = api.Message } }, api.StatusCode)
                : JsonNet(new { error = new { code = "INTERNAL_ERROR", message = "An unexpected error occurred. It was logged on the server." } }, 500);
            filterContext.ExceptionHandled = true;
        }
    }
}
