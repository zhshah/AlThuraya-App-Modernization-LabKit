using System.Text;
using System.Web;
using System.Web.Mvc;
using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;

namespace ThurayaFinance.Portal.Infrastructure
{
    /// <summary>JSON response written with Json.NET: camelCase property names, dictionary keys (entity codes) unchanged.</summary>
    public class JsonNetResult : ActionResult
    {
        public static readonly JsonSerializerSettings Settings = new JsonSerializerSettings
        {
            ContractResolver = new DefaultContractResolver
            {
                NamingStrategy = new CamelCaseNamingStrategy { ProcessDictionaryKeys = false, OverrideSpecifiedNames = false }
            },
            StringEscapeHandling = StringEscapeHandling.EscapeHtml
        };

        public JsonNetResult(object data, int statusCode = 200)
        {
            Data = data;
            StatusCode = statusCode;
        }

        public object Data { get; }

        public int StatusCode { get; }

        public static string Serialize(object data) => JsonConvert.SerializeObject(data, Settings);

        public override void ExecuteResult(ControllerContext context)
        {
            var response = context.HttpContext.Response;
            response.StatusCode = StatusCode;
            response.TrySkipIisCustomErrors = true;
            response.ContentType = "application/json";
            response.ContentEncoding = Encoding.UTF8;
            response.Cache.SetCacheability(HttpCacheability.NoCache);
            response.Cache.SetNoStore();
            response.Write(Serialize(Data));
        }
    }
}
