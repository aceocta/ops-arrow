using ScratchCard.Domain.Common;

namespace ScratchCard.Domain.Entities;

public class DeliveryPack : BaseEntity
{
    public Guid DeliveryId { get; set; }
    public Guid ScratchCardPackId { get; set; }

    public Delivery Delivery { get; set; } = null!;
    public ScratchCardPack ScratchCardPack { get; set; } = null!;
}
