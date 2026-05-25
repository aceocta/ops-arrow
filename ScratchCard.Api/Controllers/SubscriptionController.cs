using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Subscriptions;
using ScratchCard.Domain.Constants;

namespace ScratchCard.Api.Controllers;

[Route("api/subscription")]
[Authorize]
public class SubscriptionController : BaseApiController
{
    private readonly ISubscriptionService _subscriptionService;

    public SubscriptionController(ISubscriptionService subscriptionService)
    {
        _subscriptionService = subscriptionService;
    }

    [HttpGet("plans")]
    public async Task<IActionResult> GetPlans(CancellationToken cancellationToken)
    {
        var result = await _subscriptionService.GetPlansAsync(cancellationToken);
        return Success(result);
    }

    [HttpGet("summary")]
    public async Task<IActionResult> GetSummary([FromQuery] Guid companyId, CancellationToken cancellationToken)
    {
        var result = await _subscriptionService.GetSummaryAsync(companyId, cancellationToken);
        return Success(result);
    }

    [HttpPost("calculate")]
    public async Task<IActionResult> Calculate([FromBody] SubscriptionCalculationRequest request, CancellationToken cancellationToken)
    {
        var result = await _subscriptionService.CalculateAsync(request, cancellationToken);
        return Success(result);
    }

    [HttpPost("select-plan")]
    public async Task<IActionResult> SelectPlan([FromBody] SelectSubscriptionPlanRequest request, CancellationToken cancellationToken)
    {
        var result = await _subscriptionService.SelectPlanAsync(request, cancellationToken);
        return Success(result);
    }

    [HttpPost("cancel")]
    public async Task<IActionResult> Cancel([FromBody] CancelSubscriptionRequest request, CancellationToken cancellationToken)
    {
        var result = await _subscriptionService.CancelAsync(request.CompanyId, request.CancelAtPeriodEnd, cancellationToken);
        return Success(result);
    }

    [HttpPost("reactivate")]
    public async Task<IActionResult> Reactivate([FromBody] ReactivateSubscriptionRequest request, CancellationToken cancellationToken)
    {
        var result = await _subscriptionService.ReactivateAsync(request.CompanyId, cancellationToken);
        return Success(result);
    }

    [HttpGet("invoices")]
    public async Task<IActionResult> ListInvoices([FromQuery] Guid companyId, CancellationToken cancellationToken)
    {
        var result = await _subscriptionService.ListInvoicesAsync(companyId, cancellationToken);
        return Success(result);
    }

    [HttpGet("invoices/{id:guid}")]
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
