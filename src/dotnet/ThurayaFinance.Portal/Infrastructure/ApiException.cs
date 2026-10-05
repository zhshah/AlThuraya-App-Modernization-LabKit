using System;

namespace ThurayaFinance.Portal.Infrastructure
{
    /// <summary>An error returned to the browser as JSON with an HTTP status and a stable error code.</summary>
    public class ApiException : Exception
    {
        public ApiException(int statusCode, string code, string message, Exception inner = null) : base(message, inner)
        {
            StatusCode = statusCode;
            Code = code;
        }

        public int StatusCode { get; }

        public string Code { get; }

        public static ApiException BadRequest(string code, string message) => new ApiException(400, code, message);

        public static ApiException NotFound(string message) => new ApiException(404, "NOT_FOUND", message);

        public static ApiException Conflict(string code, string message) => new ApiException(409, code, message);
    }
}
