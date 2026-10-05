using System;
using System.Web;
using System.Web.Mvc;
using System.Web.Routing;
using ThurayaFinance.Portal.Infrastructure;

namespace ThurayaFinance.Portal
{
    public class MvcApplication : HttpApplication
    {
        protected void Application_Start()
        {
            MvcHandler.DisableMvcResponseHeader = true;
            ViewEngines.Engines.Clear();
            ViewEngines.Engines.Add(new RazorViewEngine());
            FilterConfig.RegisterGlobalFilters(GlobalFilters.Filters);
            RouteConfig.RegisterRoutes(RouteTable.Routes);
            PortalLog.Info("Group Finance Portal started on " + Environment.MachineName);
        }

        protected void Application_Error()
        {
            var exception = Server.GetLastError();
            if (exception == null || (exception is HttpException http && http.GetHttpCode() == 404))
            {
                return;
            }
            PortalLog.Error("Unhandled application error for " + Request.RawUrl, exception);
        }
    }
}
