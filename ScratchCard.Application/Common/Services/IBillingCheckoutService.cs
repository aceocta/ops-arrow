namespace ScratchCard.Application.Common.Services;

/// <summary>
/// Creates a hosted checkout session URL the mobile client opens in the external browser. The
/// app does not handle card data; Stripe Checkout collects and processes payment, then notifies
/// us via webhook (currently routed through RevenueCat, but a direct Stripe webhook would work
/// the same way).
/// </summary>
public interface IBillingCheckoutService
{
    Task<BillingCheckoutSession> CreateCheckoutSessionAsync(BillingCheckoutRequest request, CancellationToken cancellationToken = default);
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
