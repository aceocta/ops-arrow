using ScratchCard.Domain.Common;

namespace ScratchCard.Domain.Entities;

public class Feature : AuditableEntity
{
    // Stable string key referenced from code (see FeatureKeys.cs) and used for gate checks.
    // Treat as immutable once set — changing it strands existing SubscriptionPlanFeature rows.
    public string Key { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }

    // Free-form grouping label (e.g. "Scratch Card", "Notifications") used by admin UI to
    // organise the feature picker. Optional.
    public string? Category { get; set; }

    public int DisplayOrder { get; set; }
    public bool IsActive { get; set; } = true;

    // True when the feature is seeded by the platform (FeatureKeys.cs). System features
    // cannot be deleted via the admin API — only deactivated — because code may reference
    // their key directly.
    public bool IsSystem { get; set; }

    public ICollection<SubscriptionPlanFeature> SubscriptionPlanFeatures { get; set; } = new List<SubscriptionPlanFeature>();
}
