using System.Security.Claims;

namespace ScratchCard.Api.Middleware;

/// <summary>
/// Pushes a structured ILogger scope onto the request so every log line includes RequestId, UserId,
/// and ShopId (when present). Lets us trace a single request across services/queues by filtering
/// the structured-log sink.
/// </summary>
public class LoggingScopeMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<LoggingScopeMiddleware> _logger;

    public LoggingScopeMiddleware(RequestDelegate next, ILogger<LoggingScopeMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task Invoke(HttpContext context)
    {
        var requestId = context.TraceIdentifier;
        var userId = context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var shopId = ResolveShopId(context);

        var state = new Dictionary<string, object?>
        {
            ["RequestId"] = requestId,
            ["UserId"] = userId,
            ["ShopId"] = shopId,
        };

        using (_logger.BeginScope(state))
        {
            await _next(context);
        }
    }

    private static string? ResolveShopId(HttpContext context)
    {
        if (context.Request.Headers.TryGetValue("X-Shop-Id", out var headerShopId)
            && !string.IsNullOrWhiteSpace(headerShopId))
        {
            return headerShopId.ToString();
        }

        if (context.Request.Query.TryGetValue("shopId", out var qShopId)
            && !string.IsNullOrWhiteSpace(qShopId))
        {
            return qShopId.ToString();
        }

        return null;
    }
}
