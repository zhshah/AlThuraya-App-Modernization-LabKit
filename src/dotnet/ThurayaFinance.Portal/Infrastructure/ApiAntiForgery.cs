using System;
using System.Web;
using System.Web.Helpers;
using System.Web.Mvc;

namespace ThurayaFinance.Portal.Infrastructure
{
    /// <summary>
    /// Anti-forgery protection for the portal's JSON endpoints: the page embeds "cookieToken:formToken" in a meta tag
    /// and the browser returns it in the X-CSRF-Token header with every state-changing request.
    /// </summary>
    public static class ApiAntiForgery
    {
        public const string HeaderName = "X-CSRF-Token";

        public static string NewToken()
        {
            string cookieToken, formToken;
            AntiForgery.GetTokens(null, out cookieToken, out formToken);
            return cookieToken + ":" + formToken;
        }

        public static void Validate(HttpRequestBase request)
        {
            if (request.ContentType == null || !request.ContentType.StartsWith("application/json", StringComparison.OrdinalIgnoreCase))
            {
                throw new ApiException(415, "UNSUPPORTED_MEDIA_TYPE", "Requests must be sent as application/json.");
            }
            var header = request.Headers[HeaderName];
            var parts = string.IsNullOrEmpty(header) ? new string[0] : header.Split(':');
            if (parts.Length != 2)
            {
                throw new ApiException(403, "CSRF", "The security token is missing - reload the page.");
            }
            try
            {
                AntiForgery.Validate(parts[0], parts[1]);
            }
            catch (HttpAntiForgeryException ex)
            {
                throw new ApiException(403, "CSRF", "The security token is invalid - reload the page.", ex);
            }
        }
    }

    [AttributeUsage(AttributeTargets.Method)]
    public sealed class ValidateApiAntiForgeryTokenAttribute : FilterAttribute, IAuthorizationFilter
    {
        public void OnAuthorization(AuthorizationContext filterContext)
        {
            ApiAntiForgery.Validate(filterContext.HttpContext.Request);
        }
    }
}
