using ScratchCard.Domain.Common;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Domain.Entities;

public class ScratchCardPack : SoftDeletableAuditableEntity
{
    public Guid ShopId { get; set; }
    public Guid GameId { get; set; }
    public string PackNumber { get; set; } = string.Empty;
    public int? DisplayNumber { get; set; }
    public decimal TicketPrice { get; set; }
    public int TotalTickets { get; set; }
    public string StartSerialNumber { get; set; } = string.Empty;
    public string EndSerialNumber { get; set; } = string.Empty;
    public SellingOrder SellingOrder { get; set; } = SellingOrder.Ascending;
    public string CurrentSerialNumber { get; set; } = string.Empty;
    public PackStatus Status { get; set; } = PackStatus.InStock;
    public bool IsManuallyAdded { get; set; }
    public DateTimeOffset ReceivedDate { get; set; }
    public DateTimeOffset? ActivatedDate { get; set; }
    public Guid? ActivatedByUserId { get; set; }
    public DateTimeOffset? CompletedDate { get; set; }
    public DateTimeOffset? ReturnedDate { get; set; }
    public string? Notes { get; set; }

    public Shop Shop { get; set; } = null!;
    public ScratchCardGame Game { get; set; } = null!;
    public ICollection<DeliveryPack> DeliveryPacks { get; set; } = new List<DeliveryPack>();
    public ICollection<ShiftScratchCardSale> ShiftSales { get; set; } = new List<ShiftScratchCardSale>();
}
