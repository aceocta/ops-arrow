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
    public bool IsActive { get; set; } = true;

    public ICollection<CompanySubscription> CompanySubscriptions { get; set; } = new List<CompanySubscription>();
    public ICollection<SubscriptionDiscountRule> DiscountRules { get; set; } = new List<SubscriptionDiscountRule>();
}
