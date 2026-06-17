using ScratchCard.Application.Services;
using Xunit;

namespace ScratchCard.Tests;

// Day-close money math. These pin the exact arithmetic the business-day close commits (expected
// cash, till over/short, expected safe-drop, and canister-drop variance). A regression here would
// silently mis-state a shop's cash position at the end of every trading day.
public class DayCloseMathTests
{
    // ── ExpectedCash = totalSales − prizePayouts ──────────────────────────────
    [Theory]
    [InlineData(1000, 150, 850)]
    [InlineData(0, 0, 0)]
    [InlineData(500.50, 20.25, 480.25)]   // decimal precision is exact
    [InlineData(100, 250, -150)]          // payouts exceed sales → negative
    public void ExpectedCash_is_sales_minus_prize_payouts(decimal sales, decimal prizePayout, decimal expected)
    {
        Assert.Equal(expected, DayCloseMath.ExpectedCash(sales, prizePayout));
    }

    // ── Difference = tillPayout − expectedCash (positive = over, negative = short) ──
    [Fact]
    public void Difference_is_zero_when_till_matches_expected()
    {
        Assert.Equal(0m, DayCloseMath.Difference(tillPayout: 850m, expectedCash: 850m));
    }

    [Fact]
    public void Difference_is_negative_when_till_is_short()
    {
        Assert.Equal(-10m, DayCloseMath.Difference(tillPayout: 840m, expectedCash: 850m));
    }

    [Fact]
    public void Difference_is_positive_when_till_is_over()
    {
        Assert.Equal(15m, DayCloseMath.Difference(tillPayout: 865m, expectedCash: 850m));
    }

    // ── ExpectedDrop = sales − prize − lotto − scratch − till ─────────────────
    [Fact]
    public void ExpectedDrop_subtracts_all_payouts_from_sales()
    {
        // 1000 − 100 − 50 − 40 − 600 = 210
        Assert.Equal(210m, DayCloseMath.ExpectedDrop(
            totalSales: 1000m, totalPrizePayout: 100m, lottoPayout: 50m, scratchCardPayout: 40m, tillPayout: 600m));
    }

    // ── CashVariance = recordedDrops − expectedDrop ───────────────────────────
    [Theory]
    [InlineData(210, 210, 0)]    // balanced
    [InlineData(200, 210, -10)]  // short
    [InlineData(225, 210, 15)]   // over
    public void CashVariance_is_drops_minus_expected(decimal recordedDrops, decimal expectedDrop, decimal expected)
    {
        Assert.Equal(expected, DayCloseMath.CashVariance(recordedDrops, expectedDrop));
    }

    // ── End-to-end: a full balanced day reconciles to zero ────────────────────
    [Fact]
    public void Balanced_day_closes_with_zero_variance()
    {
        const decimal sales = 1200m, prize = 100m, lotto = 80m, scratch = 70m, till = 950m;

        var expectedCash = DayCloseMath.ExpectedCash(sales, prize);          // 1100
        Assert.Equal(1100m, expectedCash);

        var expectedDrop = DayCloseMath.ExpectedDrop(sales, prize, lotto, scratch, till); // 1200-100-80-70-950 = 0
        Assert.Equal(0m, expectedDrop);

        // Operator dropped exactly the expected amount → no variance.
        Assert.Equal(0m, DayCloseMath.CashVariance(totalDropAmount: 0m, expectedDrop: expectedDrop));
    }
}
