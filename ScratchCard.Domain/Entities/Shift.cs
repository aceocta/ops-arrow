using ScratchCard.Domain.Common;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Domain.Entities;

public class Shift : AuditableEntity
{
    public Guid BusinessDayId { get; set; }
    public Guid ShopId { get; set; }
    public string ShiftName { get; set; } = string.Empty;
    public DateTimeOffset StartTime { get; set; }
    public DateTimeOffset? EndTime { get; set; }
    public Guid OpenedByUserId { get; set; }
    public Guid? ClosedByUserId { get; set; }
    public ShiftStatus Status { get; set; } = ShiftStatus.Open;
    public SyncStatus SyncStatus { get; set; } = SyncStatus.Synced;
    public string? Notes { get; set; }

    public BusinessDay BusinessDay { get; set; } = null!;
    public Shop Shop { get; set; } = null!;
    public ICollection<ShiftOpeningSerial> OpeningSerials { get; set; } = new List<ShiftOpeningSerial>();
    public ICollection<ShiftScratchCardSale> ShiftSales { get; set; } = new List<ShiftScratchCardSale>();
    public ICollection<PrizePayout> PrizePayouts { get; set; } = new List<PrizePayout>();
    public ShiftReconciliation? ShiftReconciliation { get; set; }
}

