using ScratchCard.Domain.Common;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Domain.Entities;

/// <summary>
/// Per-shop selection of which service counters are in use, so the till report only shows what a
/// shop actually runs. One row per enabled counter; the variant captures sub-type choices
/// (e.g. Post Office Local vs Main branch, PayPoint vs Payzone, fuel grades).
/// </summary>
public class ShopServiceCounterConfig : SoftDeletableAuditableEntity
{
    public Guid ShopId { get; set; }

    /// <summary>The counter family this row enables (e.g. LotterySales, PayPoint, FuelSales, PostOffice).</summary>
    public TillCanonicalField CounterType { get; set; }
    public bool IsEnabled { get; set; } = true;

    /// <summary>Free-form sub-type, e.g. "Local" / "MainBranch" for Post Office; "PayPoint"/"Payzone".</summary>
    public string? Variant { get; set; }

    // Defaults applied to counter entries for this shop (overridable per report).
    public TillCashDirection CashDirection { get; set; } = TillCashDirection.In;
    public bool AffectsRetailDrawer { get; set; } = true;
    /// <summary>How the money settles: "Cash" / "DirectDebit" / "SeparateAccount".</summary>
    public string Settlement { get; set; } = "Cash";
    public decimal? CommissionRate { get; set; }

    public Shop Shop { get; set; } = null!;
}
