using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.Services;

/// <summary>
/// Pure till-reconciliation (proof-of-cash) arithmetic, extracted from
/// <see cref="TillReconciliationService"/> so the cash math can be unit-tested without a database.
/// Convention: a positive variance means the drawer is OVER, negative means SHORT.
/// </summary>
public static class TillReconciliationMath
{
    /// <summary>
    /// Signed contribution of a single line to the cash drawer: cash IN adds the amount, cash OUT
    /// subtracts it, and everything else (None / Separate drawer) contributes nothing.
    /// </summary>
    public static decimal DrawerDelta(decimal verifiedAmount, TillCashDirection direction) => direction switch
    {
        TillCashDirection.In => verifiedAmount,
        TillCashDirection.Out => -verifiedAmount,
        _ => 0m,
    };

    /// <summary>Cash the drawer should hold: opening float plus the net of all drawer-affecting lines.</summary>
    public static decimal ExpectedCash(decimal openingFloat, decimal drawerTotal)
        => openingFloat + drawerTotal;

    /// <summary>Counted cash minus expected (positive = over, negative = short). A null count is treated as 0.</summary>
    public static decimal CashVariance(decimal? countedCash, decimal expectedCash)
        => (countedCash ?? 0m) - expectedCash;

    /// <summary>
    /// Classify a variance into tolerance bands: within tolerance = Ok, up to 2× tolerance = Warning,
    /// beyond = Alert. Uses the absolute value, so over and short are treated symmetrically.
    /// </summary>
    public static TillVarianceStatus VarianceStatus(decimal variance, decimal tolerance)
    {
        var abs = Math.Abs(variance);
        if (abs <= tolerance) return TillVarianceStatus.Ok;
        if (abs <= tolerance * 2) return TillVarianceStatus.Warning;
        return TillVarianceStatus.Alert;
    }
}
