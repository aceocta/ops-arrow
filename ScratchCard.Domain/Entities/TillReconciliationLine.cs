using ScratchCard.Domain.Common;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Domain.Entities;

/// <summary>
/// A single figure on a reconciliation, mapped to a canonical field. Covers tenders, service
/// counters, movements, totals and exceptions — the field's metadata decides its behaviour.
/// </summary>
public class TillReconciliationLine : BaseEntity
{
    public Guid TillReconciliationId { get; set; }

    public TillCanonicalField CanonicalField { get; set; } = TillCanonicalField.Unmapped;
    /// <summary>Optional section context the figure came from (Payments / CashManagement / …).</summary>
    public string? Section { get; set; }
    /// <summary>The raw printed label this came from (for audit + learning).</summary>
    public string? RawLabel { get; set; }

    /// <summary>OCR-extracted amount before verification (null for manual entry).</summary>
    public decimal? ExtractedAmount { get; set; }
    /// <summary>The human-confirmed amount used in reconciliation.</summary>
    public decimal VerifiedAmount { get; set; }
    /// <summary>For count-based lines (parcels, no-sales, items).</summary>
    public int? Quantity { get; set; }

    public TillCaptureMethod CaptureMethod { get; set; } = TillCaptureMethod.Manual;
    public TillLineStatus Status { get; set; } = TillLineStatus.Captured;
    public string? Notes { get; set; }

    public TillReconciliation Reconciliation { get; set; } = null!;
}
