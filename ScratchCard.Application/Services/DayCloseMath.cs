namespace ScratchCard.Application.Services;

/// <summary>
/// Pure day-close arithmetic, extracted from <see cref="BusinessDayService"/> so the money math can
/// be unit-tested in isolation (no database). All amounts are in the shop's currency. By convention
/// a positive variance/difference means "cash over" and a negative one means "cash short".
/// </summary>
public static class DayCloseMath
{
    /// <summary>Cash the till should hold from trading: total sales minus prize payouts.</summary>
    public static decimal ExpectedCash(decimal totalSales, decimal totalPrizePayout)
        => totalSales - totalPrizePayout;

    /// <summary>Over/short of the counted till payout against expected cash (till − expected).</summary>
    public static decimal Difference(decimal tillPayout, decimal expectedCash)
        => tillPayout - expectedCash;

    /// <summary>
    /// Cash that should have been dropped to the safe once the day's payouts are settled:
    /// sales − prize payouts − lotto payout − scratch-card payout − till payout.
    /// </summary>
    public static decimal ExpectedDrop(
        decimal totalSales,
        decimal totalPrizePayout,
        decimal lottoPayout,
        decimal scratchCardPayout,
        decimal tillPayout)
        => totalSales - totalPrizePayout - lottoPayout - scratchCardPayout - tillPayout;

    /// <summary>Canister-drop variance: recorded drops − expected drop (positive = over, negative = short).</summary>
    public static decimal CashVariance(decimal totalDropAmount, decimal expectedDrop)
        => totalDropAmount - expectedDrop;
}
