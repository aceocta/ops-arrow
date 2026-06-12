using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Subscriptions;
using ScratchCard.Domain.Constants;
using ScratchCard.Infrastructure.Services;
using Stripe;

namespace ScratchCard.Api.Controllers;

[Route("api/shop-subscription")]
[Authorize]
public class ShopSubscriptionController : BaseApiController
{
    private readonly IShopSubscriptionService _shopSubscriptionService;
    private readonly IBillingCheckoutService _billingCheckoutService;
    private readonly IShopMembershipService _shopMembershipService;
    private readonly StripeOptions _stripeOptions;
    private readonly Microsoft.Extensions.Logging.ILogger<ShopSubscriptionController> _logger;

    public ShopSubscriptionController(
        IShopSubscriptionService shopSubscriptionService,
        IBillingCheckoutService billingCheckoutService,
        IShopMembershipService shopMembershipService,
        IOptions<StripeOptions> stripeOptions,
        Microsoft.Extensions.Logging.ILogger<ShopSubscriptionController> logger)
    {
        _shopSubscriptionService = shopSubscriptionService;
        _billingCheckoutService = billingCheckoutService;
        _shopMembershipService = shopMembershipService;
        _stripeOptions = stripeOptions.Value;
        _logger = logger;
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

    /// <summary>
    /// Idempotently creates the initial trial row for a shop. Mobile / shop-create flows call
    /// this explicitly so a pure summary GET stays side-effect free.
    /// </summary>
    [HttpPost("ensure-trial")]
    [Authorize(Roles = RoleNames.ManagementAndAbove)]
    public async Task<IActionResult> EnsureTrial([FromBody] EnsureShopTrialRequest request, CancellationToken cancellationToken)
    {
        var result = await _shopSubscriptionService.EnsureTrialAsync(request.ShopId, request.IntendedPlanId, cancellationToken);
        return Success(result);
    }

    /// <summary>
    /// Pulls the current subscription state from Stripe directly and applies it locally. Used
    /// when a webhook was lost or when the user just completed checkout — the "Refresh
    /// subscription status" button calls this so the local state catches up.
    /// </summary>
    [HttpPost("refresh-from-provider")]
    public async Task<IActionResult> RefreshFromProvider([FromBody] RefreshFromProviderRequest request, CancellationToken cancellationToken)
    {
        var result = await _shopSubscriptionService.RefreshFromProviderAsync(request.ShopId, cancellationToken);
        return Success(result);
    }

    [HttpPost("select-plan")]
    [Authorize(Roles = RoleNames.ManagementAndAbove)]
    public async Task<IActionResult> SelectPlan([FromBody] SelectShopSubscriptionPlanRequest request, CancellationToken cancellationToken)
    {
        var result = await _shopSubscriptionService.SelectPlanAsync(request, cancellationToken);
        return Success(result);
    }

    /// <summary>
    /// Creates a Stripe Checkout Session for the chosen shop + plan. The mobile app opens the
    /// returned URL in the external browser; payment happens on stripe.com, and a direct
    /// Stripe webhook activates the subscription.
    /// </summary>
    [HttpPost("checkout-session")]
    [Authorize(Roles = RoleNames.ManagementAndAbove)]
    public async Task<IActionResult> CreateCheckoutSession([FromBody] CreateBillingCheckoutRequest request, CancellationToken cancellationToken)
    {
        // Tenancy guard: checkout bypasses IShopSubscriptionService, so enforce shop membership
        // here. The caller must manage THIS shop (PlatformAdmin bypasses inside the check).
        await _shopMembershipService.EnsureCurrentUserShopRoleAsync(
            request.ShopId, new[] { RoleNames.CompanyOwner, RoleNames.Manager }, cancellationToken);

        var session = await _billingCheckoutService.CreateCheckoutSessionAsync(new BillingCheckoutRequest
        {
            ShopId = request.ShopId,
            PlanId = request.PlanId,
        }, cancellationToken);

        return Success(new BillingCheckoutResponse { Url = session.Url, Provider = session.Provider });
    }

    /// <summary>
    /// Creates a Stripe Customer Portal session URL for the company that owns this shop. Mobile
    /// opens it in the external browser so the owner can update card, cancel individual shop
    /// subscriptions, view invoices, etc.
    /// </summary>
    [HttpPost("portal-session")]
    [Authorize(Roles = RoleNames.ManagementAndAbove)]
    public async Task<IActionResult> CreatePortalSession([FromBody] PortalSessionRequest request, CancellationToken cancellationToken)
    {
        var url = await _shopSubscriptionService.CreatePortalSessionAsync(request.ShopId, cancellationToken);
        return Success(new BillingCheckoutResponse { Url = url, Provider = "stripe" });
    }

    /// <summary>
    /// Emails the caller their billing/account-management details (web portal URL, shop, plan and
    /// status). App Store-compliant alternative to in-app links: the mobile app can't link out to
    /// external subscription management, but it may send this email on the user's request.
    /// Rate-limited to one email per user+shop per 10 minutes (429 when exceeded).
    /// </summary>
    [HttpPost("/api/subscriptions/email-portal-link")]
    [HttpPost("email-portal-link")]
    [Authorize(Roles = RoleNames.OwnerAndPlatform)]
    public async Task<IActionResult> EmailPortalLink([FromBody] EmailPortalLinkRequest request, CancellationToken cancellationToken)
    {
        await _shopSubscriptionService.SendBillingPortalEmailAsync(request.ShopId, cancellationToken);
        return Success(true, "Email sent.");
    }

    [HttpPost("cancel")]
    [Authorize(Roles = RoleNames.ManagementAndAbove)]
    public async Task<IActionResult> Cancel([FromBody] CancelShopSubscriptionRequest request, CancellationToken cancellationToken)
    {
        var result = await _shopSubscriptionService.CancelAsync(request.ShopId, request.CancelAtPeriodEnd, cancellationToken);
        return Success(result);
    }

    [HttpPost("reactivate")]
    [Authorize(Roles = RoleNames.ManagementAndAbove)]
    public async Task<IActionResult> Reactivate([FromBody] ReactivateShopSubscriptionRequest request, CancellationToken cancellationToken)
    {
        var result = await _shopSubscriptionService.ReactivateAsync(request.ShopId, cancellationToken);
        return Success(result);
    }

    /// <summary>
    /// Temporarily pauses a shop. Stripe is told to stop collecting (invoices marked
    /// uncollectible during the pause). Shop is flagged inactive and gated to read-only access.
    /// Owner can resume any time within 1 year; after that a background job auto-cancels.
    /// </summary>
    [HttpPost("pause")]
    [Authorize(Roles = RoleNames.ManagementAndAbove)]
    public async Task<IActionResult> Pause([FromBody] PauseShopSubscriptionRequest request, CancellationToken cancellationToken)
    {
        var result = await _shopSubscriptionService.PauseAsync(request.ShopId, cancellationToken);
        return Success(result);
    }

    /// <summary>
    /// Resumes a paused shop. Stripe billing picks back up on the next renewal date. If the
    /// underlying Stripe subscription no longer exists (e.g. auto-cancelled by the 1-year
    /// cap), this returns 409 with code subscription_expired and the mobile app should send
    /// the owner to Choose Plan.
    /// </summary>
    [HttpPost("resume")]
    [Authorize(Roles = RoleNames.ManagementAndAbove)]
    public async Task<IActionResult> Resume([FromBody] ResumeShopSubscriptionRequest request, CancellationToken cancellationToken)
    {
        var result = await _shopSubscriptionService.ResumeAsync(request.ShopId, cancellationToken);
        return Success(result);
    }

    /// <summary>
    /// Direct Stripe webhook endpoint. Verifies the Stripe-Signature header with the configured
    /// WebhookSecret, then applies subscription / invoice events to the matching ShopSubscription.
    /// Always returns 200 (or 401 on signature failure) — non-handled events are intentionally
    /// ack'd so Stripe doesn't retry them indefinitely.
    /// </summary>
    [HttpPost("stripe-webhook")]
    [AllowAnonymous]
    public async Task<IActionResult> StripeWebhook(CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(_stripeOptions.WebhookSecret))
        {
            _logger.LogWarning("Stripe webhook called but Stripe:WebhookSecret is not configured — refusing.");
            return Unauthorized();
        }

        string body;
        using (var reader = new StreamReader(Request.Body))
        {
            body = await reader.ReadToEndAsync(cancellationToken);
        }

        Event stripeEvent;
        try
        {
            var signature = Request.Headers["Stripe-Signature"].ToString();
            // throwOnApiVersionMismatch:false — Stripe defaults new webhook destinations to the
            // latest API version (e.g. "2026-04-22.dahlia"), but the installed Stripe.NET
            // package pins to its own version (e.g. "2025-05-28.basil"). The events we read
            // (customer.subscription.*, invoice.payment_*) have been stable for years across
            // those versions, so silencing the mismatch is the pragmatic choice. Bumping the
            // Stripe.NET NuGet later will keep the strict default automatically.
            stripeEvent = EventUtility.ConstructEvent(
                body,
                signature,
                _stripeOptions.WebhookSecret,
                throwOnApiVersionMismatch: false);
        }
        catch (StripeException ex)
        {
            _logger.LogWarning(ex, "Stripe webhook signature verification failed.");
            return Unauthorized();
        }

        var handledTypes = new HashSet<string>
        {
            "customer.subscription.created",
            "customer.subscription.updated",
            "customer.subscription.deleted",
            "customer.subscription.paused",
            "customer.subscription.resumed",
            "invoice.payment_succeeded",
            "invoice.payment_failed",
        };

        if (!handledTypes.Contains(stripeEvent.Type))
        {
            // Acknowledge but don't act; lots of unrelated events flow on the same endpoint.
            _logger.LogDebug("Stripe webhook: ignoring event {EventType} ({EventId}).", stripeEvent.Type, stripeEvent.Id);
            return Success(true);
        }

        // For invoice.* events the relevant subscription id lives on the Invoice; for
        // subscription.* events the object IS the subscription. Either way we re-fetch by id
        // so we get a consistent canonical snapshot rather than relying on partial event data.
        var subscriptionId = ExtractSubscriptionId(stripeEvent.Data.Object);

        if (string.IsNullOrWhiteSpace(subscriptionId))
        {
            _logger.LogWarning(
                "Stripe webhook {EventType} ({EventId}) had no resolvable subscription id; ignoring.",
                stripeEvent.Type, stripeEvent.Id);
            return Success(true);
        }

        var snapshot = await _billingCheckoutService.GetSubscriptionAsync(subscriptionId, cancellationToken);
        if (snapshot is null)
        {
            _logger.LogWarning(
                "Stripe webhook {EventType} ({EventId}): GetSubscriptionAsync returned null for {SubId}.",
                stripeEvent.Type, stripeEvent.Id, subscriptionId);
            return Success(true);
        }

        await _shopSubscriptionService.ApplyStripeSubscriptionEventAsync(stripeEvent.Type, snapshot, cancellationToken);
        return Success(true);
    }

    /// <summary>
    /// Pulls the Stripe subscription id out of whichever event payload shape Stripe used. For
    /// `customer.subscription.*` the data object IS the subscription. For `invoice.*` the
    /// subscription id is exposed on the invoice's line items in newer Stripe.net versions.
    /// </summary>
    private static string? ExtractSubscriptionId(object? data)
    {
        switch (data)
        {
            case Stripe.Subscription sub:
                return sub.Id;
            case Stripe.Invoice inv:
                // Newer Stripe.net surfaces the subscription id via the line item's parent.
                // Walk the lines defensively — different invoice shapes (one-off, subscription
                // renewal, prorated) carry the id in slightly different places.
                foreach (var line in inv.Lines?.Data ?? [])
                {
                    var subId = line.Parent?.SubscriptionItemDetails?.Subscription;
                    if (!string.IsNullOrWhiteSpace(subId)) return subId;
                }
                return null;
            default:
                return null;
        }
    }
}
