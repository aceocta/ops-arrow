using ScratchCard.Domain.Common;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Domain.Entities;

/// <summary>
/// Per-shop coin-bag settings for one denomination: the value of a full bag, recommended quantities,
/// the stock-alert limit and alert routing. One row per (shop, denomination). Created from the
/// catalogue defaults the first time a shop opens its Coin Pod, then editable by managers/owners.
/// </summary>
public class ShopCoinBagConfig : SoftDeletableAuditableEntity
{
    public Guid ShopId { get; set; }
    public Guid CoinDenominationId { get; set; }

    /// <summary>Cash value of one full coin bag of this denomination, e.g. £20 for a £1 bag.</summary>
    public decimal BagValue { get; set; }
    public int MinBagQuantity { get; set; }
    public int MaxBagQuantity { get; set; }
    public int OpeningBagQuantity { get; set; }
    /// <summary>Trigger threshold: an alert fires when current bag quantity ≤ this value.</summary>
    public int StockAlertLimit { get; set; }

    public bool IsAlertEnabled { get; set; } = true;
    public CoinBagAlertRecipientType AlertRecipientType { get; set; } = CoinBagAlertRecipientType.OwnersAndManagers;
    /// <summary>Channel used to deliver alerts (MVP: InApp/push).</summary>
    public NotificationChannel AlertChannel { get; set; } = NotificationChannel.InApp;

    /// <summary>Whether this denomination is managed at this shop (a shop may disable 1p/2p, etc.).</summary>
    public bool IsActive { get; set; } = true;

    public DateTimeOffset? LastAlertTriggeredOn { get; set; }
    public DateTimeOffset? LastAlertResolvedOn { get; set; }

    public Shop? Shop { get; set; }
    public CoinDenomination CoinDenomination { get; set; } = null!;
}
