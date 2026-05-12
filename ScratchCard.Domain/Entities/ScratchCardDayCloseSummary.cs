using ScratchCard.Domain.Common;

namespace ScratchCard.Domain.Entities;

public class ScratchCardDayCloseSummary : AuditableEntity
{
    public Guid BusinessDayId { get; set; }
    public decimal LottoPayout { get; set; }
    public decimal ScratchCardPayout { get; set; }
    public decimal TillPayout { get; set; }

    public BusinessDay BusinessDay { get; set; } = null!;
}
