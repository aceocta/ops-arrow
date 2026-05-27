namespace ScratchCard.Infrastructure.Services;

public class StripeOptions
{
    /// <summary>
    /// Stripe secret API key (`sk_live_...` in production, `sk_test_...` for testing). Used to
    /// create Checkout Sessions, manage subscriptions, and look up customers. Never expose this
    /// to the mobile client.
    /// </summary>
    public string? SecretKey { get; set; }

    /// <summary>
    /// Stripe webhook signing secret (`whsec_...`) from Stripe Dashboard → Developers → Webhooks →
    /// click the endpoint → "Reveal" the signing secret. Required to verify that incoming webhook
    /// events were genuinely sent by Stripe and not forged.
    /// </summary>
    public string? WebhookSecret { get; set; }

    /// <summary>
    /// Legacy plan-name → Price ID mapping. Kept as a fallback for any plan whose row does not
    /// yet have <c>SubscriptionPlan.StripePriceId</c> set. New deployments should leave this
    /// empty and configure price IDs on the plan rows instead.
    /// </summary>
    public Dictionary<string, string> PriceIds { get; set; } = new();

    /// <summary>
    /// Where Stripe redirects after a successful checkout. We append a query string so the user
    /// lands on a page that nudges them back to the mobile app.
    /// </summary>
    public string SuccessUrl { get; set; } = "https://opsarrow.com/billing/success?session_id={CHECKOUT_SESSION_ID}";

    /// <summary>Where Stripe redirects when the user cancels.</summary>
    public string CancelUrl { get; set; } = "https://opsarrow.com/billing/cancel";

    /// <summary>
    /// Where Stripe redirects users after they finish managing billing in the Customer Portal.
    /// Typically a small landing page that bounces them back to the mobile app via a deep link.
    /// </summary>
    public string PortalReturnUrl { get; set; } = "https://opsarrow.com/billing/portal-return";
}
