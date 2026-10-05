using System.Threading.Tasks;
using System.Web.Mvc;
using ThurayaFinance.Portal.Infrastructure;
using ThurayaFinance.Portal.Models;
using ThurayaFinance.Portal.Services;

namespace ThurayaFinance.Portal.Controllers
{
    public class ApprovalsController : ApiControllerBase
    {
        [HttpPost]
        [Route("api/approvals/{id}/decision")]
        [ValidateApiAntiForgeryToken]
        public async Task<ActionResult> Decide(string id, DecisionRequest request)
        {
            if (request == null)
            {
                throw ApiException.BadRequest("VALIDATION", "The request body is missing.");
            }
            return JsonNet(await new ApprovalService().DecideAsync(id, request.Decision, request.Comment));
        }
    }
}
