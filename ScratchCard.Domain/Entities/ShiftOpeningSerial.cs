using ScratchCard.Domain.Common;

namespace ScratchCard.Domain.Entities;

public class ShiftOpeningSerial : AuditableEntity
{
    public Guid ShiftId { get; set; }
    public Guid BusinessDayId { get; set; }
    public Guid ShopId { get; set; }
    public Guid PackId { get; set; }
    public string ExpectedOpeningSerialNumber { get; set; } = string.Empty;
    public string ActualOpeningSerialNumber { get; set; } = string.Empty;
    public int MissingQuantity { get; set; }
    public int OverageQuantity { get; set; }

    public Shift Shift { get; set; } = null!;
    public BusinessDay BusinessDay { get; set; } = null!;
    public ScratchCardPack Pack { get; set; } = null!;
    public Shop Shop { get; set; } = null!;
}
