using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Subscriptions;
using ScratchCard.Domain.Constants;

namespace ScratchCard.Api.Controllers;

/// <summary>
/// Legacy company-scoped subscription endpoints. The active product is per-shop (see
/// <see cref="ShopSubscriptionController"/>); these endpoints exist for the catalogue +
/// platform-admin tooling only. All state-changing endpoints are restricted to
/// <see cref="RoleNames.PlatformAdmin"/> to prevent customers from self-activating
/// company-level subscriptions without payment.
/// </summary>
[Route("api/subscription")]
[Authorize]
public class SubscriptionController : BaseApiController
{
    private readonly ISubscriptionService _subscriptionService;

    public SubscriptionController(ISubscriptionService subscriptionService)
    {
        _subscriptionService = subscriptionService;
    }

    /// <summary>
    /// Returns the plan catalogue. Used by the mobile Choose Plan screen and the platform admin
    /// console. Read-only and intentionally available to every authenticated user.
    /// </summary>
    [HttpGet("plans")]
    public async Task<IActionResult> GetPlans(CancellationToken cancellationToken)
    {
        var result = await _subscriptionService.GetPlansAsync(cancellationToken);
        return Success(result);
    }

    [HttpGet("summary")]
    [Authorize(Roles = RoleNames.PlatformAdmin)]
    public async Task<IActionResult> GetSummary([FromQuery] Guid companyId, CancellationToken cancellationToken)
    {
        var result = await _subscriptionService.GetSummaryAsync(companyId, cancellationToken);
        return Success(result);
    }

    [HttpPost("calculate")]
    [Authorize(Roles = RoleNames.PlatformAdmin)]
    public async Task<IActionResult> Calculate([FromBody] SubscriptionCalculationRequest request, CancellationToken cancellationToken)
    {
        var result = await _subscriptionService.CalculateAsync(request, cancellationToken);
        return Success(result);
    }

    [HttpPost("select-plan")]
    [Authorize(Roles = RoleNames.PlatformAdmin)]
    public async Task<IActionResult> SelectPlan([FromBody] SelectSubscriptionPlanRequest request, CancellationToken cancellationToken)
    {
        var result = await _subscriptionService.SelectPlanAsync(request, cancellationToken);
        return Success(result);
    }

    [HttpPost("cancel")]
    [Authorize(Roles = RoleNames.PlatformAdmin)]
    public async Task<IActionResult> Cancel([FromBody] CancelSubscriptionRequest request, CancellationToken cancellationToken)
    {
        var result = await _subscriptionService.CancelAsync(request.CompanyId, request.CancelAtPeriodEnd, cancellationToken);
        return Success(result);
    }

    [HttpPost("reactivate")]
    [Authorize(Roles = RoleNames.PlatformAdmin)]
    public async Task<IActionResult> Reactivate([FromBody] ReactivateSubscriptionRequest request, CancellationToken cancellationToken)
    {
        var result = await _subscriptionService.ReactivateAsync(request.CompanyId, cancellationToken);
        return Success(result);
    }

    [HttpGet("invoices")]
    [Authorize(Roles = RoleNames.PlatformAdmin)]
    public async Task<IActionResult> ListInvoices([FromQuery] Guid companyId, CancellationToken cancellationToken)
    {
        var result = await _subscriptionService.ListInvoicesAsync(companyId, cancellationToken);
        return Success(result);
    }

    [HttpGet("invoices/{id:guid}")]
    [Authorize(Roles = RoleNames.PlatformAdmin)]
    public async Task<IActionResult> GetInvoice(Guid id, CancellationToken cancellationToken)
    {
        var result = await _subscriptionService.GetInvoiceAsync(id, cancellationToken);
        return Success(result);
    }

    [HttpPost("process-trial-expiry")]
    [Authorize(Roles = RoleNames.PlatformAdmin)]
    public async Task<IActionResult> ProcessTrialExpiry(CancellationToken cancellationToken)
    {
        await _subscriptionService.ProcessTrialExpiriesAsync(cancellationToken);
        return Success(true);
    }
}
