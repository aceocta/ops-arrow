using ScratchCard.Domain.Common;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Domain.Entities;

public class ShiftScratchCardSale : BaseEntity
{
    public Guid ShiftId { get; set; }
    public Guid ShopId { get; set; }
    public Guid PackId { get; set; }
    public string OpeningSerialNumber { get; set; } = string.Empty;
    public string ClosingSerialNumber { get; set; } = string.Empty;
    public string? OriginalScannedSerialNumber { get; set; }
    public SellingOrder SellingOrder { get; set; }
    public EntryMethod EntryMethod { get; set; }
    public int SoldQuantity { get; set; }
    public decimal TicketPrice { get; set; }
    public decimal SalesAmount { get; set; }
    public int RemainingTickets { get; set; }
    public bool IsManualEntry { get; set; }
    public bool IsScannedEdited { get; set; }
    public bool IsFlaggedForReview { get; set; }
    public string? ManualEntryReason { get; set; }
    public bool NotificationRequired { get; set; }
    public bool NotificationSent { get; set; }
    public DateTimeOffset? NotificationSentOn { get; set; }
    public Guid EnteredByUserId { get; set; }
    public DateTimeOffset EnteredOn { get; set; }
    public string? Notes { get; set; }

    public Shift Shift { get; set; } = null!;
    public ScratchCardPack Pack { get; set; } = null!;
    public Shop Shop { get; set; } = null!;
}
