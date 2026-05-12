using ScratchCard.Domain.Common;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Domain.Entities;

public class SubscriptionDiscountRule : AuditableEntity
{
    public Guid? SubscriptionPlanId { get; set; }
    public int MinShopCount { get; set; }
    public int? MaxShopCount { get; set; }
    public DiscountType DiscountType { get; set; }
    public decimal DiscountValue { get; set; }
    public bool IsActive { get; set; } = true;
    public string? Description { get; set; }

    public SubscriptionPlan? SubscriptionPlan { get; set; }
}
