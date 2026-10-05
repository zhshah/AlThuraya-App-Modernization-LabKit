using System.Threading.Tasks;
using System.Web.Mvc;
using ThurayaFinance.Portal.Infrastructure;
using ThurayaFinance.Portal.Models;
using ThurayaFinance.Portal.Services;

namespace ThurayaFinance.Portal.Controllers
{
    public class InvoicesController : ApiControllerBase
    {
        [HttpPost]
        [Route("api/invoices/{id}/hold")]
        [ValidateApiAntiForgeryToken]
        public async Task<ActionResult> Hold(string id, HoldRequest request)
        {
            if (request == null)
            {
                throw ApiException.BadRequest("VALIDATION", "The request body is missing.");
            }
            return JsonNet(await new InvoiceHoldService().SetHoldAsync(id, request.Hold));
        }
    }
}
