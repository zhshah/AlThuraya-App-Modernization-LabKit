using System.Threading.Tasks;
using System.Web.Mvc;
using ThurayaFinance.Portal.Services;

namespace ThurayaFinance.Portal.Controllers
{
    public class HealthController : ApiControllerBase
    {
        /// <summary>Health of the portal, its database and the treasury service (HTTP 503 when the database is down).</summary>
        [HttpGet]
        [Route("health")]
        public async Task<ActionResult> Index()
        {
            var health = await new SystemStatusService().CheckHealthAsync();
            return JsonNet(health, (string)health["status"] == "Unhealthy" ? 503 : 200);
        }
    }
}
