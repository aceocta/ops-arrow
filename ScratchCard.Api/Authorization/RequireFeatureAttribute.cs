using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.Mvc.Filters;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.Services;
using ScratchCard.Domain.Constants;

namespace ScratchCard.Api.Authorization;

/// <summary>
/// Marks a controller action as requiring a specific subscription feature on the active shop.
/// The filter resolves the shop ID from (in order) the route values, query string, or the
/// `ShopId` property of any action argument, then calls <see cref="IFeatureGateService.EnsureFeatureAsync"/>
/// which throws 403 if the shop's plan does not include the feature.
///
/// Platform admins bypass the check, mirroring <see cref="Middleware.SubscriptionAccessMiddleware"/>.
///
/// If no shop ID can be resolved from the request, the filter logs and lets the request through —
/// callers that need a hard gate should add an explicit <c>EnsureFeatureAsync</c> call inside the
/// service so the check happens once the shop ID is known.
/// </summary>
[AttributeUsage(AttributeTargets.Method | AttributeTargets.Class, AllowMultiple = true)]
public sealed class RequireFeatureAttribute : Attribute, IAsyncActionFilter
{
    public string FeatureKey { get; }

    public RequireFeatureAttribute(string featureKey)
    {
        if (string.IsNullOrWhiteSpace(featureKey))
        {
            throw new ArgumentException("Feature key is required.", nameof(featureKey));
        }
        FeatureKey = featureKey;
    }

    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var http = context.HttpContext;

        if (http.User?.IsInRole(RoleNames.PlatformAdmin) == true)
        {
            await next();
            return;
        }

        var shopId = TryResolveShopId(context);
        if (!shopId.HasValue || shopId.Value == Guid.Empty)
        {
            // No shop scope on this request. Pass through; service-level checks are the
            // safety net.
            await next();
            return;
        }

        var gate = http.RequestServices.GetRequiredService<IFeatureGateService>();
        await gate.EnsureFeatureAsync(shopId.Value, FeatureKey, http.RequestAborted);
        await next();
    }

    private static Guid? TryResolveShopId(ActionExecutingContext context)
    {
        // 1. Route values (e.g. /api/shops/{shopId}/...)
        if (context.RouteData.Values.TryGetValue("shopId", out var routeVal) &&
            Guid.TryParse(routeVal?.ToString(), out var routeShopId))
        {
            return routeShopId;
        }

        // 2. Query string (?shopId=...)
        if (context.HttpContext.Request.Query.TryGetValue("shopId", out var queryVal) &&
            Guid.TryParse(queryVal.ToString(), out var queryShopId))
        {
            return queryShopId;
        }

        // 3. Action arguments — either a Guid named "shopId" or any object with a ShopId property.
        var descriptor = context.ActionDescriptor as ControllerActionDescriptor;
        var parameters = descriptor?.MethodInfo.GetParameters();

        foreach (var kv in context.ActionArguments)
        {
            if (kv.Value is null) continue;

            if (kv.Value is Guid g)
            {
                var paramInfo = parameters?.FirstOrDefault(p => string.Equals(p.Name, kv.Key, StringComparison.Ordinal));
                if (paramInfo is not null && string.Equals(paramInfo.Name, "shopId", StringComparison.OrdinalIgnoreCase))
                {
                    return g;
                }
                continue;
            }

            var prop = kv.Value.GetType().GetProperty("ShopId");
            if (prop is null) continue;
            var value = prop.GetValue(kv.Value);
            if (value is Guid bodyShopId && bodyShopId != Guid.Empty)
            {
                return bodyShopId;
            }
        }

        return null;
    }
}
