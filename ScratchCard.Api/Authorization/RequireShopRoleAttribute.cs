using System.Security.Claims;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Entities;

namespace ScratchCard.Api.Authorization;

/// <summary>
/// Verifies the caller has at least one of the specified roles <em>for the shop the action is
/// operating on</em>. Closes the loophole where <see cref="Microsoft.AspNetCore.Authorization.AuthorizeAttribute"/>
/// only checks the global <c>UserRole</c> claim — a Manager at Shop A would otherwise pass a
/// Manager-only attribute when calling an endpoint that mutates Shop B.
///
/// Shop ID is resolved from (in order) route values, query string, or the <c>ShopId</c> property
/// of any action argument. If no shop ID can be found, the filter passes — shop-unscoped actions
/// aren't this attribute's job. Platform admins also bypass (support escape hatch).
///
/// Pair this with the global <see cref="Microsoft.AspNetCore.Authorization.AuthorizeAttribute"/> on the
/// controller, which still gates "is the caller signed in and does their global role include this
/// role family". This attribute is a second, narrower check.
/// </summary>
[AttributeUsage(AttributeTargets.Method | AttributeTargets.Class, AllowMultiple = true)]
public sealed class RequireShopRoleAttribute : Attribute, IAsyncActionFilter
{
    public IReadOnlyCollection<string> AllowedRoles { get; }

    public RequireShopRoleAttribute(params string[] allowedRoles)
    {
        if (allowedRoles is null || allowedRoles.Length == 0)
        {
            throw new ArgumentException("At least one role is required.", nameof(allowedRoles));
        }
        AllowedRoles = allowedRoles;
    }

    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var http = context.HttpContext;

        // Platform admins bypass — they hold support privileges across every shop.
        if (http.User?.IsInRole(RoleNames.PlatformAdmin) == true)
        {
            await next();
            return;
        }

        var shopId = TryResolveShopId(context);
        if (!shopId.HasValue || shopId.Value == Guid.Empty)
        {
            // No shop scope on this request — let it through. The class-level [Authorize] still
            // enforces global role membership; this attribute only adds the per-shop layer.
            await next();
            return;
        }

        var subject = http.User?.FindFirstValue(ClaimTypes.NameIdentifier) ?? http.User?.FindFirstValue("sub");
        if (!Guid.TryParse(subject, out var userId))
        {
            http.Response.StatusCode = StatusCodes.Status401Unauthorized;
            await http.Response.WriteAsJsonAsync(new { code = "unauthorized", message = "User context is missing." });
            return;
        }

        var shopUserRepository = http.RequestServices.GetRequiredService<IRepository<ShopUser>>();
        var shopRole = await shopUserRepository.Query()
            .AsNoTracking()
            .Where(x => x.UserId == userId && x.ShopId == shopId.Value && x.IsActive)
            .Include(x => x.Role)
            .Select(x => x.Role.Name)
            .FirstOrDefaultAsync(http.RequestAborted);

        if (string.IsNullOrEmpty(shopRole))
        {
            http.Response.StatusCode = StatusCodes.Status403Forbidden;
            await http.Response.WriteAsJsonAsync(new
            {
                code = "shop_membership_missing",
                message = "You are not a member of this shop.",
            });
            return;
        }

        if (!AllowedRoles.Any(r => string.Equals(r, shopRole, StringComparison.OrdinalIgnoreCase)))
        {
            http.Response.StatusCode = StatusCodes.Status403Forbidden;
            await http.Response.WriteAsJsonAsync(new
            {
                code = "shop_role_insufficient",
                message = $"Your role at this shop ({shopRole}) doesn't permit this action. Required: {string.Join(" or ", AllowedRoles)}.",
            });
            return;
        }

        await next();
    }

    private static Guid? TryResolveShopId(ActionExecutingContext context)
    {
        if (context.RouteData.Values.TryGetValue("shopId", out var routeVal) &&
            Guid.TryParse(routeVal?.ToString(), out var routeShopId))
        {
            return routeShopId;
        }

        if (context.HttpContext.Request.Query.TryGetValue("shopId", out var queryVal) &&
            Guid.TryParse(queryVal.ToString(), out var queryShopId))
        {
            return queryShopId;
        }

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
