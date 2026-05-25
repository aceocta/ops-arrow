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
    public string? IncludedFeatures { get; set; }
    public int? MaxUsers { get; set; }
    public int? ReportExportsPerMonth { get; set; }
    // Store-side product IDs for IAP receipt mapping. Apple StoreKit and Google Play use
    // separate IDs; leave null if the plan is admin-only.
    public string? AppleProductId { get; set; }
    public string? GoogleProductId { get; set; }
    public bool IsActive { get; set; } = true;

    public ICollection<CompanySubscription> CompanySubscriptions { get; set; } = new List<CompanySubscription>();
    public ICollection<SubscriptionDiscountRule> DiscountRules { get; set; } = new List<SubscriptionDiscountRule>();
}
