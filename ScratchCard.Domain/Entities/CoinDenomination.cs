using ScratchCard.Domain.Common;

namespace ScratchCard.Domain.Entities;

/// <summary>
/// A supported UK coin denomination (1p … £2) used by the Coin Pod feature. Seeded globally as
/// read-only reference data; per-shop bag value, opening quantity and alert limits live on
/// <see cref="ShopCoinBagConfig"/>. <see cref="CoinValue"/> is the face value of a single coin.
/// </summary>
public class CoinDenomination : AuditableEntity
{
    /// <summary>Long name, e.g. "One Pound".</summary>
    public string Name { get; set; } = string.Empty;
    /// <summary>Stable machine code, e.g. "GBP_1".</summary>
    public string Code { get; set; } = string.Empty;
    /// <summary>Shop-friendly label shown in the UI, e.g. "£1" or "1p".</summary>
    public string DisplayLabel { get; set; } = string.Empty;
    /// <summary>Face value of one coin, e.g. 1.00 for £1, 0.01 for 1p.</summary>
    public decimal CoinValue { get; set; }
    /// <summary>Globally active/inactive (a denomination removed from circulation can be disabled).</summary>
    public bool IsActive { get; set; } = true;
    public int SortOrder { get; set; }
}
