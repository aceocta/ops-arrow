using ScratchCard.Domain.Common;

namespace ScratchCard.Domain.Entities;

/// <summary>
/// The shop's single pot of loose (un-bagged) coin cash — mixed denominations the user doesn't split
/// out. A per-shop singleton (one row per shop). Its <see cref="Amount"/> is added into the Coin Pod
/// total; there is no pack conversion, no min/max and no low-stock alert — the user just enters any value.
/// </summary>
public class ShopCoinLooseCash : AuditableEntity
{
    public Guid ShopId { get; set; }
    public decimal Amount { get; set; }

    public DateTimeOffset? LastUpdatedOn { get; set; }
    public Guid? LastUpdatedByUserId { get; set; }

    public Shop? Shop { get; set; }
}
