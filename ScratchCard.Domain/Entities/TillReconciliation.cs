using ScratchCard.Domain.Common;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Domain.Entities;

/// <summary>
/// One reconciled trading period for a single till (shift or day-end). Holds the float, the
/// counted cash, the computed expected cash and over/short, plus the canonical lines that explain
/// it (tenders, service counters, movements). Phase 1 MVP — drawer reconciliation.
/// </summary>
public class TillReconciliation : SoftDeletableAuditableEntity
{
    public Guid ShopId { get; set; }
    public Guid? TillId { get; set; }
    public TillReportType ReportType { get; set; } = TillReportType.DayEnd;
    public Guid? ShiftId { get; set; }
    public Guid? BusinessDayId { get; set; }
    public DateOnly BusinessDate { get; set; }

    public TillReconciliationStatus Status { get; set; } = TillReconciliationStatus.Draft;

    public decimal OpeningFloat { get; set; }
    /// <summary>Whole-drawer cash counted at close (null until counted).</summary>
    public decimal? CountedCash { get; set; }
    /// <summary>Denomination breakdown JSON from the cash-count tool (audit).</summary>
    public string? DenominationJson { get; set; }
    /// <summary>Cash to leave in the till for the next session.</summary>
    public decimal? FloatToCarry { get; set; }
    /// <summary>Card total from the terminal/acquirer, for the card axis check.</summary>
    public decimal? CardCounted { get; set; }

    // Computed at reconcile time (stored so reports don't recompute).
    public decimal ExpectedCash { get; set; }
    public decimal CashVariance { get; set; }

    public string? VarianceReasonCode { get; set; }
    public string? VarianceNotes { get; set; }

    public Guid? ConfirmedByUserId { get; set; }
    public DateTimeOffset? ConfirmedOn { get; set; }

    public Shop Shop { get; set; } = null!;
    public Till? Till { get; set; }
    public ICollection<TillReconciliationLine> Lines { get; set; } = new List<TillReconciliationLine>();
    public ICollection<TillReconciliationAttachment> Attachments { get; set; } = new List<TillReconciliationAttachment>();
}
