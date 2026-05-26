using ScratchCard.Domain.Common;

namespace ScratchCard.Domain.Entities;

public class SubscriptionPlanFeature : AuditableEntity
{
    public Guid SubscriptionPlanId { get; set; }
    public Guid FeatureId { get; set; }

    // Per-plan toggle. A row with IsEnabled = false is treated identically to no row, but is
    // kept so admins can disable a feature on a plan without losing any per-plan overrides
    // (LimitValue, Notes) below.
    public bool IsEnabled { get; set; } = true;

    // Optional numeric override scoped to this plan/feature pair (e.g. "max items" when the
    // feature represents a quantity-bounded capability). Null means "no override / unlimited".
    // The semantics of LimitValue are owned by the feature itself; the gating code interprets it.
    public int? LimitValue { get; set; }

    public string? Notes { get; set; }

    public SubscriptionPlan SubscriptionPlan { get; set; } = null!;
    public Feature Feature { get; set; } = null!;
}
