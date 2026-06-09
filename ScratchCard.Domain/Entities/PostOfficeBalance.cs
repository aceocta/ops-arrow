using ScratchCard.Domain.Common;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Domain.Entities;

/// <summary>
/// The Post Office (Horizon) cash balance for a shop's branch on a day — reconciled SEPARATELY from
/// the retail till drawer (its own account). One row per shop + business date.
/// </summary>
public class PostOfficeBalance : SoftDeletableAuditableEntity
{
    public Guid ShopId { get; set; }
    public DateOnly BusinessDate { get; set; }

    public decimal OpeningBalance { get; set; }
    /// <summary>Cash taken in at the PO counter (deposits, sales).</summary>
    public decimal CashIn { get; set; }
    /// <summary>Cash paid out at the PO counter (banking withdrawals, payments).</summary>
    public decimal CashOut { get; set; }

    public decimal ExpectedBalance { get; set; }
    public decimal? CountedBalance { get; set; }
    public decimal Variance { get; set; }

    public string? Notes { get; set; }
    public TillReconciliationStatus Status { get; set; } = TillReconciliationStatus.Draft;
    public Guid? ConfirmedByUserId { get; set; }
    public DateTimeOffset? ConfirmedOn { get; set; }

    public Shop Shop { get; set; } = null!;
}
