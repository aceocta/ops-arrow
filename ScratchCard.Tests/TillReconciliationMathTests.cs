using ScratchCard.Application.Services;
using ScratchCard.Domain.Enums;
using Xunit;

namespace ScratchCard.Tests;

// Till proof-of-cash math. These pin how the drawer is built from lines, how expected cash and the
// variance are derived, and how a variance is graded into Ok/Warning/Alert bands. A regression here
// would mis-state every till count and mis-fire (or suppress) cash-variance alerts.
public class TillReconciliationMathTests
{
    // ── DrawerDelta: In adds, Out subtracts, everything else is neutral ───────
    [Fact]
    public void DrawerDelta_cash_in_adds()
        => Assert.Equal(40m, TillReconciliationMath.DrawerDelta(40m, TillCashDirection.In));

    [Fact]
    public void DrawerDelta_cash_out_subtracts()
        => Assert.Equal(-40m, TillReconciliationMath.DrawerDelta(40m, TillCashDirection.Out));

    [Theory]
    [InlineData(TillCashDirection.None)]
    [InlineData(TillCashDirection.Separate)]
    public void DrawerDelta_non_cash_directions_are_neutral(TillCashDirection direction)
        => Assert.Equal(0m, TillReconciliationMath.DrawerDelta(40m, direction));

    // ── ExpectedCash = openingFloat + drawerTotal ────────────────────────────
    [Theory]
    [InlineData(50, 200, 250)]
    [InlineData(0, 0, 0)]
    [InlineData(50, -80, -30)]   // net cash-out below the float
    public void ExpectedCash_is_float_plus_drawer(decimal openingFloat, decimal drawerTotal, decimal expected)
        => Assert.Equal(expected, TillReconciliationMath.ExpectedCash(openingFloat, drawerTotal));

    // ── CashVariance = counted − expected (null counted = 0) ──────────────────
    [Fact]
    public void CashVariance_balances_to_zero()
        => Assert.Equal(0m, TillReconciliationMath.CashVariance(countedCash: 250m, expectedCash: 250m));

    [Fact]
    public void CashVariance_short_is_negative()
        => Assert.Equal(-10m, TillReconciliationMath.CashVariance(countedCash: 240m, expectedCash: 250m));

    [Fact]
    public void CashVariance_over_is_positive()
        => Assert.Equal(10m, TillReconciliationMath.CashVariance(countedCash: 260m, expectedCash: 250m));

    [Fact]
    public void CashVariance_null_count_treated_as_zero()
        => Assert.Equal(-250m, TillReconciliationMath.CashVariance(countedCash: null, expectedCash: 250m));

    // ── VarianceStatus tolerance bands (tolerance £5: ≤5 Ok, ≤10 Warning, >10 Alert) ──
    [Theory]
    [InlineData(0, TillVarianceStatus.Ok)]
    [InlineData(5, TillVarianceStatus.Ok)]      // boundary inclusive
    [InlineData(-5, TillVarianceStatus.Ok)]     // symmetric (abs)
    [InlineData(5.01, TillVarianceStatus.Warning)]
    [InlineData(10, TillVarianceStatus.Warning)] // boundary inclusive
    [InlineData(-7, TillVarianceStatus.Warning)]
    [InlineData(10.01, TillVarianceStatus.Alert)]
    [InlineData(-25, TillVarianceStatus.Alert)]
    public void VarianceStatus_grades_by_tolerance(decimal variance, TillVarianceStatus expected)
        => Assert.Equal(expected, TillReconciliationMath.VarianceStatus(variance, tolerance: 5m));

    // ── End-to-end: build a drawer from mixed lines and grade the count ───────
    [Fact]
    public void Full_count_with_small_shortfall_is_ok()
    {
        // Opening float 50; cash sales +300 in, paid-out -20 out, a Separate line ignored.
        var drawer =
            TillReconciliationMath.DrawerDelta(300m, TillCashDirection.In) +
            TillReconciliationMath.DrawerDelta(20m, TillCashDirection.Out) +
            TillReconciliationMath.DrawerDelta(99m, TillCashDirection.Separate);
        Assert.Equal(280m, drawer);

        var expected = TillReconciliationMath.ExpectedCash(50m, drawer); // 330
        Assert.Equal(330m, expected);

        var variance = TillReconciliationMath.CashVariance(countedCash: 327m, expectedCash: expected); // -3
        Assert.Equal(-3m, variance);
        Assert.Equal(TillVarianceStatus.Ok, TillReconciliationMath.VarianceStatus(variance, 5m));
    }
}
