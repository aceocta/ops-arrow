using ScratchCard.Domain.Common;

namespace ScratchCard.Domain.Entities;

/// <summary>
/// The current coin-bag stock level for one denomination at one shop. One row per (shop,
/// denomination), recalculated after every stock-changing transaction. <see cref="CurrentTotalValue"/>
/// is denormalised (= bag value × current quantity) for fast dashboard totals.
/// </summary>
public class ShopCoinBagStock : SoftDeletableAuditableEntity
{
    public Guid ShopId { get; set; }
    public Guid CoinDenominationId { get; set; }

    public int CurrentBagQuantity { get; set; }
    public decimal CurrentTotalValue { get; set; }

    public DateTimeOffset? LastUpdatedOn { get; set; }
    public Guid? LastUpdatedByUserId { get; set; }

    public Shop? Shop { get; set; }
    public CoinDenomination CoinDenomination { get; set; } = null!;
}
