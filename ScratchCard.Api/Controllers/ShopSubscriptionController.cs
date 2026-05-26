using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Subscriptions;
using ScratchCard.Infrastructure.Services;

namespace ScratchCard.Api.Controllers;

[Route("api/shop-subscription")]
[Authorize]
public class ShopSubscriptionController : BaseApiController
{
    private readonly IShopSubscriptionService _shopSubscriptionService;
    private readonly IBillingCheckoutService _billingCheckoutService;
    private readonly RevenueCatOptions _revenueCatOptions;

    public ShopSubscriptionController(
        IShopSubscriptionService shopSubscriptionService,
        IBillingCheckoutService billingCheckoutService,
        IOptions<RevenueCatOptions> revenueCatOptions)
    {
        _shopSubscriptionService = shopSubscriptionService;
        _billingCheckoutService = billingCheckoutService;
        _revenueCatOptions = revenueCatOptions.Value;
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

    /// <summary>
    /// Creates a Stripe Checkout Session for the chosen shop + plan. The mobile app opens the
    /// returned URL in the external browser; payment happens on stripe.com, and Stripe → RevenueCat
    /// → /revenuecat-webhook activates the subscription.
    /// </summary>
    [HttpPost("checkout-session")]
    public async Task<IActionResult> CreateCheckoutSession([FromBody] CreateBillingCheckoutRequest request, CancellationToken cancellationToken)
    {
        var session = await _billingCheckoutService.CreateCheckoutSessionAsync(new BillingCheckoutRequest
        {
            ShopId = request.ShopId,
            PlanId = request.PlanId,
        }, cancellationToken);

        return Success(new BillingCheckoutResponse { Url = session.Url, Provider = session.Provider });
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

    /// <summary>
    /// Anonymous endpoint that RevenueCat calls when a subscription lifecycle event occurs.
    /// Verifies the fixed Authorization header (configured in the RevenueCat dashboard) before
    /// applying the event to the matching ShopSubscription.
    /// </summary>
    [HttpPost("revenuecat-webhook")]
    [AllowAnonymous]
    public async Task<IActionResult> RevenueCatWebhook([FromBody] RevenueCatWebhookPayload payload, CancellationToken cancellationToken)
    {
        var expected = _revenueCatOptions.WebhookAuthorization;
        if (string.IsNullOrWhiteSpace(expected))
        {
            // Refuse to accept webhooks when no secret is configured — fail closed.
            return Unauthorized();
        }

        var provided = Request.Headers["Authorization"].ToString();
        if (!CryptographicallyEqual(provided, expected))
        {
            return Unauthorized();
        }

        if (payload.Event is null)
        {
            return Success(true);
        }

        await _shopSubscriptionService.ApplyRevenueCatEventAsync(payload.Event, cancellationToken);
        return Success(true);
    }

    private static bool CryptographicallyEqual(string a, string b)
    {
        if (a is null || b is null) return false;
        var bytesA = System.Text.Encoding.UTF8.GetBytes(a);
        var bytesB = System.Text.Encoding.UTF8.GetBytes(b);
        return System.Security.Cryptography.CryptographicOperations.FixedTimeEquals(bytesA, bytesB);
    }
}
