using ScratchCard.Domain.Common;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Domain.Entities;

public class ShopScratchCardGame : SoftDeletableAuditableEntity
{
    public Guid ShopId { get; set; }
    public Guid MasterGameId { get; set; }
    public bool IsActive { get; set; } = true;
    public string DefaultStartSerialNumber { get; set; } = string.Empty;
    public string DefaultEndSerialNumber { get; set; } = string.Empty;
    public SellingOrder DefaultSellingOrder { get; set; } = SellingOrder.Ascending;

    public Shop Shop { get; set; } = null!;
    public ScratchCardGame MasterGame { get; set; } = null!;
}
