using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Admin;
using ScratchCard.Domain.Constants;

namespace ScratchCard.Api.Controllers;

/// <summary>
/// PlatformAdmin-only management of customers (Companies) across the whole platform. Backs the
/// admin web app; gated to the PlatformAdmin role.
/// </summary>
[Route("api/admin/customers")]
[Authorize(Roles = RoleNames.PlatformAdmin)]
public class AdminCustomersController : BaseApiController
{
    private readonly IAdminCustomerService _adminCustomerService;

    public AdminCustomersController(IAdminCustomerService adminCustomerService)
    {
        _adminCustomerService = adminCustomerService;
    }

    /// <summary>Paged, searchable list of all customers. ?search= matches company name or email.</summary>
    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] string? search,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken cancellationToken = default)
    {
        var result = await _adminCustomerService.ListCustomersAsync(search, page, pageSize, cancellationToken);
        return Success(result);
    }

    /// <summary>Full detail for one customer: company fields + shops + users + subscription rollup.</summary>
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken cancellationToken)
    {
        var result = await _adminCustomerService.GetCustomerAsync(id, cancellationToken);
        return Success(result);
    }

    /// <summary>Edit a customer's company details (name, contact, address, active state).</summary>
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] AdminUpdateCustomerRequest request, CancellationToken cancellationToken)
    {
        var result = await _adminCustomerService.UpdateCustomerAsync(id, request, cancellationToken);
        return Success(result);
    }

    [HttpPost("{id:guid}/suspend")]
    public async Task<IActionResult> Suspend(Guid id, CancellationToken cancellationToken)
    {
        var result = await _adminCustomerService.SetCustomerStatusAsync(id, false, cancellationToken);
        return Success(result);
    }

    [HttpPost("{id:guid}/activate")]
    public async Task<IActionResult> Activate(Guid id, CancellationToken cancellationToken)
    {
        var result = await _adminCustomerService.SetCustomerStatusAsync(id, true, cancellationToken);
        return Success(result);
    }

    /// <summary>Activate/deactivate a customer user for a specific shop membership.</summary>
    [HttpPost("{id:guid}/users/{userId:guid}/active")]
    public async Task<IActionResult> SetUserActive(Guid id, Guid userId, [FromBody] AdminSetUserActiveRequest request, CancellationToken cancellationToken)
    {
        var result = await _adminCustomerService.SetUserActiveAsync(id, userId, request.ShopId, request.IsActive, cancellationToken);
        return Success(result);
    }

    /// <summary>Assign a role to a customer user for a specific shop membership.</summary>
    [HttpPut("{id:guid}/users/{userId:guid}/role")]
    public async Task<IActionResult> AssignUserRole(Guid id, Guid userId, [FromBody] AdminAssignUserRoleRequest request, CancellationToken cancellationToken)
    {
        var result = await _adminCustomerService.AssignUserRoleAsync(id, userId, request.ShopId, request.RoleId, cancellationToken);
        return Success(result);
    }

    /// <summary>Assign a subscription plan to a specific shop of this customer.</summary>
    [HttpPost("{id:guid}/shops/{shopId:guid}/subscription/select-plan")]
    public async Task<IActionResult> SelectShopPlan(Guid id, Guid shopId, [FromBody] AdminSelectShopPlanRequest request, CancellationToken cancellationToken)
    {
        var result = await _adminCustomerService.SelectShopPlanAsync(id, shopId, request.PlanId, cancellationToken);
        return Success(result);
    }

    /// <summary>Cancel a specific shop's subscription.</summary>
    [HttpPost("{id:guid}/shops/{shopId:guid}/subscription/cancel")]
    public async Task<IActionResult> CancelShopSubscription(Guid id, Guid shopId, [FromBody] AdminCancelShopSubscriptionRequest request, CancellationToken cancellationToken)
    {
        var result = await _adminCustomerService.CancelShopSubscriptionAsync(id, shopId, request.CancelAtPeriodEnd, cancellationToken);
        return Success(result);
    }

    /// <summary>Reactivate a specific shop's subscription.</summary>
    [HttpPost("{id:guid}/shops/{shopId:guid}/subscription/reactivate")]
    public async Task<IActionResult> ReactivateShopSubscription(Guid id, Guid shopId, CancellationToken cancellationToken)
    {
        var result = await _adminCustomerService.ReactivateShopSubscriptionAsync(id, shopId, cancellationToken);
        return Success(result);
    }

    /// <summary>Invite a user to a specific shop of this customer (sends the invitation email).</summary>
    [HttpPost("{id:guid}/shops/{shopId:guid}/invitations")]
    public async Task<IActionResult> InviteShopUser(Guid id, Guid shopId, [FromBody] AdminInviteUserRequest request, CancellationToken cancellationToken)
    {
        var result = await _adminCustomerService.InviteShopUserAsync(id, shopId, request.Email, request.RoleId, request.ExpiryHours, cancellationToken);
        return Success(result);
    }
}
