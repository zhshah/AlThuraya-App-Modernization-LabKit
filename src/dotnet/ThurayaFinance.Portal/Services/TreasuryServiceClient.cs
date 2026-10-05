using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json;
using ThurayaFinance.Portal.Infrastructure;
using ThurayaFinance.Portal.Models;

namespace ThurayaFinance.Portal.Services
{
    public class TreasuryServiceException : Exception
    {
        public TreasuryServiceException(string message, Exception inner = null) : base(message, inner)
        {
        }

        public HttpStatusCode? StatusCode { get; set; }

        public string ErrorCode { get; set; }
    }

    /// <summary>REST client for the Java treasury service hosted on the same server's Tomcat (see TreasuryServiceUrl in Web.config).</summary>
    public class TreasuryServiceClient
    {
        private static readonly HttpClient Http = CreateClient();

        // Dates stay strings: the browser receives them exactly as the treasury service sends them.
        private static readonly JsonSerializerSettings ReadSettings = new JsonSerializerSettings { DateParseHandling = DateParseHandling.None };

        public static string BaseUrl => Http.BaseAddress.ToString();

        public Task<TreasuryPositionDto> GetPositionAsync() => SendAsync<TreasuryPositionDto>(HttpMethod.Get, "api/treasury/position", null);

        public Task<IList<PaymentRunDto>> GetPaymentRunsAsync() => SendAsync<IList<PaymentRunDto>>(HttpMethod.Get, "api/payment-runs", null);

        public Task<PaymentRunDto> GetPaymentRunAsync(string runId) => SendAsync<PaymentRunDto>(HttpMethod.Get, "api/payment-runs/" + Uri.EscapeDataString(runId), null);

        public Task<TreasuryStatusDto> GetStatusAsync() => SendAsync<TreasuryStatusDto>(HttpMethod.Get, "api/status", null);

        public Task<PaymentRunDto> DecideRunAsync(string runId, string decision, string approverId, string comment) =>
            SendAsync<PaymentRunDto>(HttpMethod.Post, "api/payment-runs/" + Uri.EscapeDataString(runId) + "/decision",
                new { decision, approverId, comment });

        private static HttpClient CreateClient()
        {
            var client = new HttpClient
            {
                BaseAddress = new Uri(PortalSettings.TreasuryServiceUrl),
                Timeout = TimeSpan.FromSeconds(PortalSettings.TreasuryServiceTimeoutSeconds)
            };
            client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
            client.DefaultRequestHeaders.UserAgent.ParseAdd("ThurayaFinancePortal/4.12");
            return client;
        }

        private static async Task<T> SendAsync<T>(HttpMethod method, string path, object payload)
        {
            var request = new HttpRequestMessage(method, path);
            if (payload != null)
            {
                request.Content = new StringContent(JsonConvert.SerializeObject(payload), Encoding.UTF8, "application/json");
            }
            HttpResponseMessage response;
            try
            {
                response = await Http.SendAsync(request).ConfigureAwait(false);
            }
            catch (HttpRequestException ex)
            {
                throw new TreasuryServiceException("The treasury service is unreachable at " + Http.BaseAddress + " (" + ex.GetBaseException().Message + ")", ex);
            }
            catch (TaskCanceledException ex)
            {
                throw new TreasuryServiceException("The treasury service at " + Http.BaseAddress + " did not respond within " + Http.Timeout.TotalSeconds + " seconds", ex);
            }
            using (response)
            {
                var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                if (!response.IsSuccessStatusCode)
                {
                    string code = null, message = null;
                    try
                    {
                        var error = JsonConvert.DeserializeAnonymousType(body, new { code = "", message = "" }, ReadSettings);
                        code = error == null ? null : error.code;
                        message = error == null ? null : error.message;
                    }
                    catch (JsonException)
                    {
                    }
                    throw new TreasuryServiceException("The treasury service returned " + (int)response.StatusCode + ": " +
                        (message ?? body.Substring(0, Math.Min(200, body.Length))))
                    { StatusCode = response.StatusCode, ErrorCode = code };
                }
                try
                {
                    return JsonConvert.DeserializeObject<T>(body, ReadSettings);
                }
                catch (JsonException ex)
                {
                    throw new TreasuryServiceException("The treasury service returned an unreadable response for " + path, ex);
                }
            }
        }
    }
}
