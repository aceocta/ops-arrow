namespace ScratchCard.Infrastructure.Services;

public class StripeOptions
{
    /// <summary>
    /// Stripe secret API key (`sk_live_...` in production, `sk_test_...` for testing). Used to
    /// create Checkout Sessions and look up customers. Never expose this to the mobile client.
    /// </summary>
    public string? SecretKey { get; set; }

    /// <summary>
    /// Mapping from internal plan identifier (Starter / Growth / Pro) to the Stripe Price ID.
    /// Stripe Checkout takes a Price ID, not a Product ID. Configure prices in the Stripe Dashboard
    /// → Products, then paste their `price_...` IDs here.
    ///
    /// Example appsettings:
    ///   "Stripe": {
    ///     "PriceIds": {
    ///       "Starter Monthly": "price_1Abc...",
    ///       "Growth Monthly": "price_1Def...",
    ///       "Pro Monthly": "price_1Ghi..."
    ///     }
    ///   }
    /// </summary>
    public Dictionary<string, string> PriceIds { get; set; } = new();

    /// <summary>
    /// Where Stripe redirects after a successful checkout. We append a query string so the user
    /// lands on a page that nudges them back to the mobile app.
    /// </summary>
    public string SuccessUrl { get; set; } = "https://opsarrow.co.uk/billing/success?session_id={CHECKOUT_SESSION_ID}";

    /// <summary>Where Stripe redirects when the user cancels.</summary>
    public string CancelUrl { get; set; } = "https://opsarrow.co.uk/billing/cancel";
}
