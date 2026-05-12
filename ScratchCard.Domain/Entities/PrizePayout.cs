using ScratchCard.Domain.Common;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Domain.Entities;

public class PrizePayout : BaseEntity
{
    public Guid ShopId { get; set; }
    public Guid BusinessDayId { get; set; }
    public Guid ShiftId { get; set; }
    public Guid? PackId { get; set; }
    public string? TicketNumber { get; set; }
    public decimal PrizeAmount { get; set; }
    public string PaymentMethod { get; set; } = "Cash";
    public PrizePayoutApprovalStatus ApprovalStatus { get; set; } = PrizePayoutApprovalStatus.Pending;
    public Guid PaidByUserId { get; set; }
    public DateTimeOffset PaidOn { get; set; }
    public Guid? ApprovedByUserId { get; set; }
    public DateTimeOffset? ApprovedOn { get; set; }
    public string? Notes { get; set; }

    public Shop Shop { get; set; } = null!;
    public BusinessDay BusinessDay { get; set; } = null!;
    public Shift Shift { get; set; } = null!;
    public ScratchCardPack? Pack { get; set; }
}
