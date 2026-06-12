using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Application.Common.Services;

namespace ScratchCard.Api.Controllers;

/// <summary>
/// Anonymous endpoints consumed by the public Ops Arrow marketing website. Everything here
/// must stay safe for unauthenticated consumption — curated DTOs only (no Stripe price IDs,
/// no plan IDs, no internal-only fields).
/// </summary>
[Route("api/public")]
[AllowAnonymous]
public class PublicController : BaseApiController
{
    private readonly ISubscriptionService _subscriptionService;

    public PublicController(ISubscriptionService subscriptionService)
    {
        _subscriptionService = subscriptionService;
    }

    /// <summary>
    /// Returns the active plan catalogue for the marketing pricing page. Active plans only,
    /// ordered by display order then price, with features grouped by catalogue category.
    /// </summary>
    [HttpGet("plans")]
    public async Task<IActionResult> GetPlans(CancellationToken cancellationToken)
    {
        var result = await _subscriptionService.GetPublicPlansAsync(cancellationToken);
        return Success(result);
    }
}
