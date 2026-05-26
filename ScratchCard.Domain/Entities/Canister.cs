using ScratchCard.Domain.Common;

namespace ScratchCard.Domain.Entities;

public class Canister : AuditableEntity
{
    public Guid ShopId { get; set; }
    public string CanisterNumber { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;

    // Optional ceiling on the cumulative amount held in this canister. When the feature
    // safe_drop.canister_limit_alerts is on, exceeding this triggers a manager alert.
    public decimal? MaxAmount { get; set; }

    public Shop Shop { get; set; } = null!;
    public ICollection<CanisterDrop> CanisterDrops { get; set; } = new List<CanisterDrop>();
}
