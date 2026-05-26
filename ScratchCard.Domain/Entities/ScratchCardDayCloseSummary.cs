using ScratchCard.Domain.Common;

namespace ScratchCard.Domain.Entities;

public class ScratchCardDayCloseSummary : AuditableEntity
{
    public Guid BusinessDayId { get; set; }
    public decimal LottoPayout { get; set; }
    public decimal ScratchCardPayout { get; set; }
    public decimal TillPayout { get; set; }

    // Safe-drop cash-variance fields. Populated on day-close for shops on plans that include
    // safe_drop.cash_variance. CashVariance = TotalDropped - ExpectedDrop (positive => over).
    public decimal? TotalCanisterDropAmount { get; set; }
    public decimal? CashVariance { get; set; }

    public BusinessDay BusinessDay { get; set; } = null!;
}
