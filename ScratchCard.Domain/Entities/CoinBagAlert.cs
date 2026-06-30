using ScratchCard.Domain.Common;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Domain.Entities;

/// <summary>
/// A low/out-of-stock alert raised for one denomination at one shop. At most one alert is Active per
/// (shop, denomination) at a time (duplicate-prevention); it auto-resolves when stock rises back above
/// the alert limit. Records the transaction that triggered it and the one that resolved it.
/// </summary>
public class CoinBagAlert : AuditableEntity
{
    public Guid ShopId { get; set; }
    public Guid CoinDenominationId { get; set; }

    public CoinBagAlertType AlertType { get; set; }
    public int CurrentBagQuantity { get; set; }
    public int StockAlertLimit { get; set; }
    public CoinBagAlertStatus Status { get; set; } = CoinBagAlertStatus.Active;
    public string Message { get; set; } = string.Empty;

    public DateTimeOffset TriggeredOn { get; set; } = DateTimeOffset.UtcNow;
    public Guid? TriggeredByTransactionId { get; set; }
    public DateTimeOffset? ResolvedOn { get; set; }
    public Guid? ResolvedByTransactionId { get; set; }
    public DateTimeOffset? DismissedOn { get; set; }
    public Guid? DismissedByUserId { get; set; }

    public Shop? Shop { get; set; }
    public CoinDenomination CoinDenomination { get; set; } = null!;
}
