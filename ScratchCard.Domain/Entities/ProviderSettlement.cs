using ScratchCard.Domain.Common;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Domain.Entities;

/// <summary>
/// Reconciles a provider's periodic settlement (Direct Debit / commission statement) against the
/// totals captured daily from the till reconciliations across the period. Closes the loop between
/// "we took the cash" and "we were settled/paid correctly".
/// </summary>
public class ProviderSettlement : SoftDeletableAuditableEntity
{
    public Guid ShopId { get; set; }
    public SettlementProvider Provider { get; set; }
    public DateOnly PeriodStart { get; set; }
    public DateOnly PeriodEnd { get; set; }

    // Captured bottom-up from till reconciliation lines in the period.
    public decimal CapturedSales { get; set; }
    public decimal CapturedPrizes { get; set; }
    public decimal CapturedCommission { get; set; }
    /// <summary>Net amount we expect to be settled by DD (sales − prizes − commission for lottery;
    /// cash collected for PayPoint/Payzone).</summary>
    public decimal CapturedOwed { get; set; }

    // Entered top-down from the provider statement.
    public decimal? StatementAmount { get; set; }
    public decimal? StatementCommission { get; set; }
    public decimal? DdAmount { get; set; }
    public DateOnly? DdDate { get; set; }

    public decimal Variance { get; set; }
    public SettlementStatus Status { get; set; } = SettlementStatus.Open;
    public string? Notes { get; set; }

    public Shop Shop { get; set; } = null!;
}
