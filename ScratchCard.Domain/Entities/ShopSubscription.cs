using ScratchCard.Domain.Common;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Domain.Entities;

public class ShopSubscription : AuditableEntity
{
    public Guid ShopId { get; set; }
    public Guid CompanyId { get; set; }
    public Guid? SubscriptionPlanId { get; set; }
    public SubscriptionStatus Status { get; set; }
    public BillingCycle BillingCycle { get; set; }
    public decimal Price { get; set; }
    public DateTimeOffset? TrialStartedOn { get; set; }
    public DateTimeOffset? TrialEndsOn { get; set; }
    public DateTimeOffset? CurrentPeriodStartedOn { get; set; }
    public DateTimeOffset? CurrentPeriodEndsOn { get; set; }
    public DateTimeOffset? CancelledOn { get; set; }
    public bool CancelAtPeriodEnd { get; set; }
    public string? PaymentProvider { get; set; }
    public string? ProviderProductId { get; set; }
    public string? ProviderSubscriptionId { get; set; }
    public string? ProviderOriginalTransactionId { get; set; }

    public Shop Shop { get; set; } = null!;
    public Company Company { get; set; } = null!;
    public SubscriptionPlan? SubscriptionPlan { get; set; }
}
