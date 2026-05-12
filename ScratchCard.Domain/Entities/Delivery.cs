using ScratchCard.Domain.Common;

namespace ScratchCard.Domain.Entities;

public class Delivery : AuditableEntity
{
    public Guid ShopId { get; set; }
    public DateTimeOffset DeliveryDate { get; set; }
    public string SupplierName { get; set; } = string.Empty;
    public string DeliveryReference { get; set; } = string.Empty;
    public Guid ReceivedByUserId { get; set; }
    public string? Notes { get; set; }

    public Shop Shop { get; set; } = null!;
    public ICollection<DeliveryPack> DeliveryPacks { get; set; } = new List<DeliveryPack>();
}
