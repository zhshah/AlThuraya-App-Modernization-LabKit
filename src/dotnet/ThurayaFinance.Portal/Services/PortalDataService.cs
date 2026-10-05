using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using ThurayaFinance.Portal.Data;
using ThurayaFinance.Portal.Infrastructure;
using ThurayaFinance.Portal.Models;

namespace ThurayaFinance.Portal.Services
{
    /// <summary>Builds the dataset for the portal UI: finance data from SQL Server plus the treasury position from the Java service.</summary>
    public class PortalDataService
    {
        public async Task<PortalData> LoadAsync()
        {
            var data = await new PortalDataReader().ReadAsync().ConfigureAwait(false);
            var treasury = new TreasuryServiceClient();
            try
            {
                var positionTask = treasury.GetPositionAsync();
                var runsTask = treasury.GetPaymentRunsAsync();
                await Task.WhenAll(positionTask, runsTask).ConfigureAwait(false);
                var position = positionTask.Result;
                data.Banks = position.Banks;
                data.Accounts = position.Accounts;
                data.Forecast = position.Forecast;
                data.OpeningCash = position.OpeningCash;
                data.PolicyMinimum = position.PolicyMinimum;
                data.PaymentRuns = runsTask.Result;
            }
            catch (TreasuryServiceException ex)
            {
                PortalLog.Error("Treasury data unavailable - the portal shows finance data only", ex);
                data.TreasuryError = ex.Message;
                data.Banks = new List<BankDto>();
                data.Accounts = new List<AccountDto>();
                data.Forecast = new List<ForecastWeekDto>();
                data.PaymentRuns = new List<PaymentRunDto>();
                data.Approvals = data.Approvals.Where(a => a.Type != "run").ToList();
            }
            data.Platform = await new SystemStatusService().GetPlatformAsync().ConfigureAwait(false);
            return data;
        }
    }
}
