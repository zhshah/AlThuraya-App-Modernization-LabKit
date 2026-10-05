using System;
using System.Diagnostics;
using System.Text;
using System.Threading.Tasks;
using System.Web;
using System.Web.Mvc;
using ThurayaFinance.Portal.Infrastructure;
using ThurayaFinance.Portal.Services;

namespace ThurayaFinance.Portal.Controllers
{
    public class HomeController : Controller
    {
        private static readonly string AssetVersion = FileVersionInfo.GetVersionInfo(typeof(HomeController).Assembly.Location).FileVersion + "-" +
            System.IO.File.GetLastWriteTimeUtc(typeof(HomeController).Assembly.Location).Ticks.ToString("x");

        /// <summary>The portal shell; the UI itself is assets/app.js.</summary>
        [HttpGet]
        public ActionResult Index()
        {
            NoStore();
            ViewBag.CsrfToken = ApiAntiForgery.NewToken();
            ViewBag.AssetVersion = AssetVersion;
            return View();
        }

        /// <summary>The portal dataset as a script (window.ATH.data), loaded by the page before app.js.</summary>
        [HttpGet]
        [Route("portal/data")]
        public async Task<ActionResult> DataScript()
        {
            NoStore();
            string script;
            try
            {
                var data = await new PortalDataService().LoadAsync();
                script = "window.ATH.data = " + JsonNetResult.Serialize(data) + ";\n";
            }
            catch (Exception ex)
            {
                // A script error response would not run, so report the failure to the UI inside a valid script.
                PortalLog.Error("Portal data could not be loaded", ex);
                script = "window.ATH.loadError = " + JsonNetResult.Serialize("The finance data could not be loaded from the database. The error was logged on the server.") + ";\n";
            }
            return Content("window.ATH = window.ATH || {};\n" + script, "application/javascript", Encoding.UTF8);
        }

        /// <summary>The same dataset as JSON, for integration tests and the parity check.</summary>
        [HttpGet]
        [Route("api/data")]
        public async Task<ActionResult> Data()
        {
            try
            {
                return new JsonNetResult(await new PortalDataService().LoadAsync());
            }
            catch (Exception ex)
            {
                PortalLog.Error("Portal data could not be loaded", ex);
                return new JsonNetResult(new { error = new { code = "DATA_UNAVAILABLE", message = "The portal data could not be loaded. The error was logged on the server." } }, 503);
            }
        }

        private void NoStore()
        {
            Response.Cache.SetCacheability(HttpCacheability.NoCache);
            Response.Cache.SetNoStore();
        }
    }
}
