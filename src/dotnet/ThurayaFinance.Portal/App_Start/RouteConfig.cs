using System.Web.Mvc;
using System.Web.Routing;

namespace ThurayaFinance.Portal
{
    public static class RouteConfig
    {
        public static void RegisterRoutes(RouteCollection routes)
        {
            routes.IgnoreRoute("{resource}.axd/{*pathInfo}");
            routes.MapMvcAttributeRoutes();
            routes.MapRoute(name: "Portal", url: "", defaults: new { controller = "Home", action = "Index" });
        }
    }
}
