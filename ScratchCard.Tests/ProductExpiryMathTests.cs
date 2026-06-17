using ScratchCard.Application.Services;
using ScratchCard.Domain.Enums;
using Xunit;

namespace ScratchCard.Tests;

// The expiry status grading + save/bin classification are the core of the waste-reduction feature:
// they decide what surfaces on the daily worklist and what counts toward the binned-vs-saved KPI.
public class ProductExpiryMathTests
{
    private static readonly DateOnly Today = new(2026, 6, 17);
    private static readonly int[] Dairy = { 7, 3, 0 };       // min 0, max 7
    private static readonly int[] Chocolate = { 30, 14, 7 }; // min 7, max 30

    // ── StatusOf ──────────────────────────────────────────────────────────────
    [Theory]
    [InlineData(10, "Safe")]
    [InlineData(8, "Safe")]
    [InlineData(7, "ExpiringSoon")]
    [InlineData(3, "ExpiringSoon")]
    [InlineData(1, "ExpiringSoon")]
    [InlineData(0, "Urgent")]   // expiry day, within the 0-day stage
    [InlineData(-1, "Expired")]
    public void StatusOf_dairy_bands(int daysOffset, string expected)
        => Assert.Equal(expected, ProductExpiryMath.StatusOf(Today.AddDays(daysOffset), Today, Dairy).ToString());

    [Theory]
    [InlineData(40, "Safe")]
    [InlineData(30, "ExpiringSoon")]
    [InlineData(8, "ExpiringSoon")]
    [InlineData(7, "Urgent")]
    [InlineData(2, "Urgent")]
    [InlineData(-3, "Expired")]
    public void StatusOf_chocolate_bands(int daysOffset, string expected)
        => Assert.Equal(expected, ProductExpiryMath.StatusOf(Today.AddDays(daysOffset), Today, Chocolate).ToString());

    [Theory]
    [InlineData(5, "Safe")]   // no rules → Safe until the day
    [InlineData(0, "Urgent")]
    [InlineData(-1, "Expired")]
    public void StatusOf_no_rules_defaults(int daysOffset, string expected)
        => Assert.Equal(expected, ProductExpiryMath.StatusOf(Today.AddDays(daysOffset), Today, System.Array.Empty<int>()).ToString());

    [Fact]
    public void DaysToExpiry_is_signed()
    {
        Assert.Equal(5, ProductExpiryMath.DaysToExpiry(Today.AddDays(5), Today));
        Assert.Equal(-2, ProductExpiryMath.DaysToExpiry(Today.AddDays(-2), Today));
    }

    // ── Save vs bin classification ─────────────────────────────────────────────
    [Theory]
    [InlineData(ProductExpiryActionType.MoveToFront, true)]
    [InlineData(ProductExpiryActionType.Discount, true)]
    [InlineData(ProductExpiryActionType.MarkSold, true)]
    [InlineData(ProductExpiryActionType.Donate, true)]
    [InlineData(ProductExpiryActionType.ReturnToSupplier, true)]
    [InlineData(ProductExpiryActionType.Dispose, false)]
    public void IsSaveAction_only_dispose_is_a_bin(ProductExpiryActionType action, bool isSave)
        => Assert.Equal(isSave, ProductExpiryMath.IsSaveAction(action));

    [Theory]
    [InlineData(ProductExpiryActionType.MoveToFront, false)]
    [InlineData(ProductExpiryActionType.Discount, false)]
    [InlineData(ProductExpiryActionType.MarkSold, true)]
    [InlineData(ProductExpiryActionType.Donate, true)]
    [InlineData(ProductExpiryActionType.ReturnToSupplier, true)]
    [InlineData(ProductExpiryActionType.Dispose, true)]
    public void ReducesStock_only_final_dispositions(ProductExpiryActionType action, bool reduces)
        => Assert.Equal(reduces, ProductExpiryMath.ReducesStock(action));

    // ── Money ──────────────────────────────────────────────────────────────────
    [Fact]
    public void EstimatedLoss_uses_unit_cost_or_zero()
    {
        Assert.Equal(6m, ProductExpiryMath.EstimatedLoss(3, 2m));
        Assert.Equal(0m, ProductExpiryMath.EstimatedLoss(3, null));
    }

    [Fact]
    public void SavedValue_uses_unit_price_or_zero()
    {
        Assert.Equal(6m, ProductExpiryMath.SavedValue(4, 1.5m));
        Assert.Equal(0m, ProductExpiryMath.SavedValue(4, null));
    }

    [Theory]
    [InlineData(8, 2, 0.8)]
    [InlineData(0, 0, 1.0)]   // nothing handled yet → 100% (nothing binned)
    [InlineData(5, 0, 1.0)]
    [InlineData(0, 5, 0.0)]
    public void SaveRate_is_saved_over_total(int saved, int binned, decimal expected)
        => Assert.Equal(expected, ProductExpiryMath.SaveRate(saved, binned));
}
