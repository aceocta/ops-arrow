using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Subscriptions;

namespace ScratchCard.Api.Controllers;

[Route("api/shop-subscription")]
[Authorize]
public class ShopSubscriptionController : BaseApiController
{
    private readonly IShopSubscriptionService _shopSubscriptionService;

    public ShopSubscriptionController(IShopSubscriptionService shopSubscriptionService)
    {
        _shopSubscriptionService = shopSubscriptionService;
    }

    [HttpGet("summary")]
    public async Task<IActionResult> GetSummary([FromQuery] Guid shopId, CancellationToken cancellationToken)
    {
        var result = await _shopSubscriptionService.GetSummaryAsync(shopId, cancellationToken);
        return Success(result);
    }

    [HttpGet("entitlements")]
    public async Task<IActionResult> GetEntitlements([FromQuery] Guid shopId, CancellationToken cancellationToken)
    {
        var result = await _shopSubscriptionService.GetEntitlementsAsync(shopId, cancellationToken);
        return Success(result);
    }

    [HttpPost("select-plan")]
    public async Task<IActionResult> SelectPlan([FromBody] SelectShopSubscriptionPlanRequest request, CancellationToken cancellationToken)
    {
        var result = await _shopSubscriptionService.SelectPlanAsync(request, cancellationToken);
        return Success(result);
    }

    [HttpPost("iap-receipt")]
    public async Task<IActionResult> RecordIapReceipt([FromBody] ShopIapReceiptRequest request, CancellationToken cancellationToken)
    {
        var result = await _shopSubscriptionService.RecordIapReceiptAsync(request, cancellationToken);
        return Success(result);
    }

    [HttpPost("cancel")]
    public async Task<IActionResult> Cancel([FromBody] CancelShopSubscriptionRequest request, CancellationToken cancellationToken)
    {
        var result = await _shopSubscriptionService.CancelAsync(request.ShopId, request.CancelAtPeriodEnd, cancellationToken);
        return Success(result);
    }

    [HttpPost("reactivate")]
    public async Task<IActionResult> Reactivate([FromBody] ReactivateShopSubscriptionRequest request, CancellationToken cancellationToken)
    {
        var result = await _shopSubscriptionService.ReactivateAsync(request.ShopId, cancellationToken);
        return Success(result);
    }
}
