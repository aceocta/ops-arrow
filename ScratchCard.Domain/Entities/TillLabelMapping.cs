using ScratchCard.Domain.Common;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Domain.Entities;

/// <summary>
/// A learned/seeded mapping from a normalized printed label to a canonical field. Three tiers
/// (Till > Shop > Global) resolved in priority order; a confirmed Till-scope mapping always wins.
/// Persists the "map once per till, remember forever" learning.
/// </summary>
public class TillLabelMapping : AuditableEntity
{
    public TillMappingScope Scope { get; set; } = TillMappingScope.Till;
    // Null for Global. For Shop scope = shopId; for Till scope = tillId.
    public Guid? ScopeId { get; set; }

    /// <summary>Normalized match key (UPPERCASE, alphanumeric only).</summary>
    public string NormalizedLabel { get; set; } = string.Empty;
    /// <summary>A human-readable sample of the raw label, for display in review screens.</summary>
    public string? RawSample { get; set; }
    /// <summary>Optional section context (e.g. Payments / CashManagement) for disambiguation.</summary>
    public string? Section { get; set; }

    public TillCanonicalField CanonicalField { get; set; } = TillCanonicalField.Unmapped;
    /// <summary>Canonical field code (built-in name or custom). Authoritative; the enum above is the
    /// built-in equivalent (Unmapped for custom codes).</summary>
    public string FieldCode { get; set; } = nameof(TillCanonicalField.Unmapped);
    public TillMappingSource Source { get; set; } = TillMappingSource.Learned;
    public double Confidence { get; set; } = 1.0;
}
