using System;
using System.Threading.Tasks;
using ThurayaFinance.Portal.Data;
using ThurayaFinance.Portal.Infrastructure;
using ThurayaFinance.Portal.Models;

namespace ThurayaFinance.Portal.Services
{
    /// <summary>Records user activity that happens in the browser (sign-in, document views, exports) in the audit trail.</summary>
    public class AuditTrailService
    {
        private static readonly string[][] Allowed =
        {
            new[] { "signin", "session" },
            new[] { "view", "invoice" },
            new[] { "export", "report" }
        };

        public async Task<AuditDto> RecordAsync(AuditEventRequest request)
        {
            var action = (request.Action ?? string.Empty).Trim();
            var objectType = (request.Object ?? string.Empty).Trim();
            var reference = (request.Ref ?? string.Empty).Trim();
            if (Array.FindIndex(Allowed, pair => pair[0] == action && pair[1] == objectType) < 0)
            {
                throw ApiException.BadRequest("VALIDATION", "This activity cannot be recorded from the browser.");
            }
            if (reference.Length == 0 || reference.Length > 60)
            {
                throw ApiException.BadRequest("VALIDATION", "The reference must have 1 to 60 characters.");
            }

            using (var connection = await Db.OpenAsync().ConfigureAwait(false))
            {
                var settings = await FinanceRepository.GetSettingsAsync(connection, null).ConfigureAwait(false);
                return await FinanceRepository.InsertAuditAsync(connection, null, settings, action, objectType, reference).ConfigureAwait(false);
            }
        }
    }
}
