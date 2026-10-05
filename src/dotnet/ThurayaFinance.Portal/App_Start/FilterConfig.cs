using System.Web.Mvc;
using ThurayaFinance.Portal.Infrastructure;

namespace ThurayaFinance.Portal
{
    public static class FilterConfig
    {
        public static void RegisterGlobalFilters(GlobalFilterCollection filters)
        {
            filters.Add(new LogExceptionFilter());
            filters.Add(new HandleErrorAttribute());
        }
    }
}
