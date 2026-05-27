using ScratchCard.Domain.Common;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Domain.Entities;

public class SubscriptionPlan : AuditableEntity
{
    public string Name { get; set; } = string.Empty;
    public BillingCycle BillingCycle { get; set; }
    public decimal PricePerShop { get; set; }
    public int TrialDays { get; set; }
    public string? Description { get; set; }
    public int? MaxUsers { get; set; }
    public int? ReportExportsPerMonth { get; set; }

    // Legacy store-side product IDs from the original IAP integration. Kept on the schema so
    // existing rows don't break, but no code path reads them in the Stripe-direct model.
    public string? AppleProductId { get; set; }
    public string? GoogleProductId { get; set; }

    // Stripe Price ID for the App-to-Web Checkout flow (e.g. "price_1Abc..."). Required for
    // any plan that should be purchasable via the web checkout. Live and test modes have
    // different IDs — keep environment overrides via user-secrets / env vars, not source.
    public string? StripePriceId { get; set; }

    public int DisplayOrder { get; set; }

    public bool IsActive { get; set; } = true;

    public ICollection<CompanySubscription> CompanySubscriptions { get; set; } = new List<CompanySubscription>();
    public ICollection<SubscriptionDiscountRule> DiscountRules { get; set; } = new List<SubscriptionDiscountRule>();
    public ICollection<SubscriptionPlanFeature> PlanFeatures { get; set; } = new List<SubscriptionPlanFeature>();
}
