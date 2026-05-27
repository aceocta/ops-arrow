namespace ScratchCard.Application.Common.Services;

/// <summary>
/// Creates a hosted checkout session URL the mobile client opens in the external browser, and
/// manages the lifecycle of subscriptions created through it (cancel / reactivate). The app
/// never handles card data; Stripe Checkout collects and processes payment, then notifies
/// us via webhook (currently routed through RevenueCat, but a direct Stripe webhook would work
/// the same way).
/// </summary>
public interface IBillingCheckoutService
{
    Task<BillingCheckoutSession> CreateCheckoutSessionAsync(BillingCheckoutRequest request, CancellationToken cancellationToken = default);

    /// <summary>
    /// Cancels a Stripe subscription. When <paramref name="cancelAtPeriodEnd"/> is true the
    /// subscription is flagged to terminate at period end (the user keeps access until then);
    /// otherwise the subscription ends immediately and access stops on the next webhook.
    /// </summary>
    Task CancelSubscriptionAsync(string providerSubscriptionId, bool cancelAtPeriodEnd, CancellationToken cancellationToken = default);

    /// <summary>
    /// Reverts a "cancel at period end" flag on a Stripe subscription so it continues to renew.
    /// </summary>
    Task ReactivateSubscriptionAsync(string providerSubscriptionId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Pauses a Stripe subscription via <c>pause_collection.behavior = mark_uncollectible</c>.
    /// Invoices continue to generate during the pause but are written off, so the audit trail
    /// shows zero-billed cycles for the period. The subscription stays alive and can be
    /// resumed without re-collecting the card.
    /// </summary>
    Task PauseSubscriptionAsync(string providerSubscriptionId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Clears <c>pause_collection</c> on a Stripe subscription so normal billing resumes on the
    /// next renewal date.
    /// </summary>
    Task ResumeSubscriptionAsync(string providerSubscriptionId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Creates a Stripe Customer Portal session URL. The mobile app opens this in an external
    /// browser so the company owner can update card, cancel any of their shop subscriptions,
    /// view invoices, etc. The portal handles every billing concern out of the box.
    /// </summary>
    Task<string> CreatePortalSessionAsync(string stripeCustomerId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Server-to-server fetch of a Stripe subscription's current state. Used by the
    /// "refresh subscription status" recovery flow when a webhook was missed.
    /// </summary>
    Task<StripeSubscriptionSnapshot?> GetSubscriptionAsync(string providerSubscriptionId, CancellationToken cancellationToken = default);
}

/// <summary>
/// Minimal projection of a Stripe Subscription used for one-shot resync from the provider.
/// </summary>
public sealed class StripeSubscriptionSnapshot
{
    public string Id { get; init; } = string.Empty;
    public string CustomerId { get; init; } = string.Empty;
    public string PriceId { get; init; } = string.Empty;
    /// <summary>Stripe subscription status: trialing / active / past_due / canceled / unpaid / incomplete.</summary>
    public string Status { get; init; } = string.Empty;
    public DateTimeOffset? CurrentPeriodStart { get; init; }
    public DateTimeOffset? CurrentPeriodEnd { get; init; }
    public DateTimeOffset? TrialEnd { get; init; }
    public bool CancelAtPeriodEnd { get; init; }
    public DateTimeOffset? CanceledAt { get; init; }
    public Guid? ShopId { get; init; }
    public Guid? PlanId { get; init; }
}

public class BillingCheckoutRequest
{
    public Guid ShopId { get; set; }
    public Guid PlanId { get; set; }
    /// <summary>Optional email to prefill on Checkout. We use the company owner's email.</summary>
    public string? CustomerEmail { get; set; }
}

public class BillingCheckoutSession
{
    public string Url { get; set; } = string.Empty;
    public string ProviderSessionId { get; set; } = string.Empty;
    public string Provider { get; set; } = "stripe";
}
