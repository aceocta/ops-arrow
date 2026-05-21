using ScratchCard.Domain.Common;

namespace ScratchCard.Domain.Entities;

public class Canister : AuditableEntity
{
    public Guid ShopId { get; set; }
    public string CanisterNumber { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;

    public Shop Shop { get; set; } = null!;
    public ICollection<CanisterDrop> CanisterDrops { get; set; } = new List<CanisterDrop>();
}
