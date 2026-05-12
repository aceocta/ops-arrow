using ScratchCard.Domain.Common;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Domain.Entities;

public class BusinessDay : AuditableEntity
{
    public Guid ShopId { get; set; }
    public DateOnly BusinessDate { get; set; }
    public BusinessDayStatus Status { get; set; } = BusinessDayStatus.Open;
    public Guid OpenedByUserId { get; set; }
    public DateTimeOffset OpenedOn { get; set; }
    public Guid? ClosedByUserId { get; set; }
    public DateTimeOffset? ClosedOn { get; set; }
    public decimal TotalSalesAmount { get; set; }
    public decimal TotalPrizePayout { get; set; }
    public decimal ExpectedCash { get; set; }
    public decimal ActualCash { get; set; }
    public decimal Difference { get; set; }
    public string? Notes { get; set; }

    public Shop Shop { get; set; } = null!;
    public ICollection<Shift> Shifts { get; set; } = new List<Shift>();
    public ICollection<PrizePayout> PrizePayouts { get; set; } = new List<PrizePayout>();
    public ScratchCardDayCloseSummary? ScratchCardDayCloseSummary { get; set; }
    public ScratchCardDayReview? ScratchCardDayReview { get; set; }
}
