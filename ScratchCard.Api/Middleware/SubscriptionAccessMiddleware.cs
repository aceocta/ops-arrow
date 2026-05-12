using System.Security.Claims;
using ScratchCard.Application.Common.Services;
using ScratchCard.Domain.Constants;

namespace ScratchCard.Api.Middleware;

public class SubscriptionAccessMiddleware
{
    private static readonly string[] AllowedPrefixes =
    [
        "/swagger",
        "/api/auth",
        "/api/companies/signup",
        "/api/subscription",
        "/api/admin/subscription-discount-rules",
        "/api/companies/mine"
    ];

    private readonly RequestDelegate _next;
    private readonly ILogger<SubscriptionAccessMiddleware> _logger;

    public SubscriptionAccessMiddleware(RequestDelegate next, ILogger<SubscriptionAccessMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task Invoke(HttpContext context, ISubscriptionAccessService subscriptionAccessService)
    {
        if (context.User?.Identity?.IsAuthenticated != true)
        {
            await _next(context);
            return;
        }

        var path = context.Request.Path.Value ?? string.Empty;
        if (AllowedPrefixes.Any(prefix => path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) ||
            IsAllowedReadonlyShopPath(context.Request.Method, path))
        {
            await _next(context);
            return;
        }

        if (context.User.IsInRole(RoleNames.PlatformAdmin))
        {
            await _next(context);
            return;
        }

        var subject = context.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? context.User.FindFirstValue("sub");
        if (!Guid.TryParse(subject, out var userId))
        {
            await _next(context);
            return;
        }

        var access = await subscriptionAccessService.GetAccessResultAsync(userId, context.RequestAborted);
        if (access.IsAllowed)
        {
            await _next(context);
            return;
        }

        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        context.Response.ContentType = "application/json";

        var payload = access.BlockingStatus == Domain.Enums.SubscriptionStatus.TrialExpired
            ? new { code = "trial_expired", message = "Your free trial has ended. Please select a monthly or annual subscription to continue." }
            : new { code = "subscription_inactive", message = "Your subscription is not active. Please choose a plan to continue using the application." };

        _logger.LogInformation("Blocked request due to inactive subscription. Path={Path} UserId={UserId} Status={Status}", path, userId, access.BlockingStatus);
        await context.Response.WriteAsJsonAsync(payload);
    }

    private static bool IsAllowedReadonlyShopPath(string method, string path)
    {
        if (!HttpMethods.IsGet(method))
        {
            return false;
        }

        return path.Equals("/api/shops", StringComparison.OrdinalIgnoreCase) ||
               path.StartsWith("/api/shops/", StringComparison.OrdinalIgnoreCase);
    }
}
