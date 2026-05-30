using ScratchCard.Domain.Common;

namespace ScratchCard.Domain.Entities;

/// <summary>
/// A platform-wide directory of visitor / contractor organisation (company) names. Shared across
/// all shops so the same supplier/contractor is spelled consistently everywhere. When a visitor
/// is signed in we resolve the typed company name against this table (or create a new row) and
/// store the canonical name on the entry. Holds only generic business names — no personal data.
/// </summary>
public class VisitorOrganisation : AuditableEntity
{
    public string Name { get; set; } = string.Empty;

    // Lower-cased, whitespace-collapsed key used for de-duplication and lookups. Unique.
    public string NormalizedName { get; set; } = string.Empty;

    public int UsageCount { get; set; }
    public DateTimeOffset? LastUsedOn { get; set; }
}
