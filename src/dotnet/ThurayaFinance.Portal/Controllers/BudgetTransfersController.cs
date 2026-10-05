using System.Threading.Tasks;
using System.Web.Mvc;
using ThurayaFinance.Portal.Infrastructure;
using ThurayaFinance.Portal.Models;
using ThurayaFinance.Portal.Services;

namespace ThurayaFinance.Portal.Controllers
{
    public class BudgetTransfersController : ApiControllerBase
    {
        [HttpPost]
        [Route("api/budget-transfers")]
        [ValidateApiAntiForgeryToken]
        public async Task<ActionResult> Create(BudgetTransferRequest request)
        {
            if (request == null)
            {
                throw ApiException.BadRequest("VALIDATION", "The request body is missing.");
            }
            return JsonNet(await new BudgetTransferService().CreateAsync(request), 201);
        }
    }
}
