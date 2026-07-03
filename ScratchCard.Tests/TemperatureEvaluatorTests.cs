using ScratchCard.Application.Services;
using ScratchCard.Domain.Enums;
using Xunit;

namespace ScratchCard.Tests;

// The Pass/Warning/Fail verdict is the heart of the food-safety feature — recording, reports and alerts
// all grade readings through TemperatureEvaluator. These pin the exact boundaries from the requirements:
//   Hot:  Pass 63–70,  Warning 60–62.9,  Fail < 60
//   Cold: Pass 0–5,    Warning 5.1–8,    Fail > 8
//   Frozen (PROVISIONAL): Pass ≤ -18, Warning -17.9…-12, Fail > -12
public class TemperatureEvaluatorTests
{
    // ── Hot food (default target band 63–70) ─────────────────────────────────
    [Theory]
    [InlineData(70.0, TemperatureResult.Pass)]
    [InlineData(66.0, TemperatureResult.Pass)]
    [InlineData(63.0, TemperatureResult.Pass)]    // lower Pass boundary (inclusive)
    [InlineData(62.9, TemperatureResult.Warning)] // just below target
    [InlineData(60.0, TemperatureResult.Warning)] // lower Warning boundary (inclusive)
    [InlineData(59.9, TemperatureResult.Fail)]    // just below the legal floor
    [InlineData(58.0, TemperatureResult.Fail)]
    [InlineData(72.0, TemperatureResult.Pass)]    // above target is still safe for hot food
    public void Hot_food_grades_against_spec_bands(double temp, TemperatureResult expected)
        => Assert.Equal(expected, TemperatureEvaluator.Evaluate(FoodCategory.HotFood, (decimal)temp));

    // ── Cold food (default target band 0–5) ──────────────────────────────────
    [Theory]
    [InlineData(0.0, TemperatureResult.Pass)]
    [InlineData(3.0, TemperatureResult.Pass)]
    [InlineData(5.0, TemperatureResult.Pass)]     // upper Pass boundary (inclusive)
    [InlineData(5.1, TemperatureResult.Warning)]  // just above ideal
    [InlineData(8.0, TemperatureResult.Warning)]  // upper Warning boundary (inclusive)
    [InlineData(8.1, TemperatureResult.Fail)]     // just above the legal ceiling
    [InlineData(12.0, TemperatureResult.Fail)]
    [InlineData(-2.0, TemperatureResult.Pass)]    // colder than ideal is still safe for chilled food
    public void Cold_food_grades_against_spec_bands(double temp, TemperatureResult expected)
        => Assert.Equal(expected, TemperatureEvaluator.Evaluate(FoodCategory.ColdFood, (decimal)temp));

    // ── Frozen (PROVISIONAL default target ≤ -18, fail above -12) ─────────────
    [Theory]
    [InlineData(-22.0, TemperatureResult.Pass)]
    [InlineData(-18.0, TemperatureResult.Pass)]    // upper Pass boundary (inclusive)
    [InlineData(-17.9, TemperatureResult.Warning)]
    [InlineData(-12.0, TemperatureResult.Warning)] // upper Warning boundary (inclusive)
    [InlineData(-11.9, TemperatureResult.Fail)]
    [InlineData(-5.0, TemperatureResult.Fail)]
    public void Frozen_grades_against_provisional_bands(double temp, TemperatureResult expected)
        => Assert.Equal(expected, TemperatureEvaluator.Evaluate(FoodCategory.Frozen, (decimal)temp));

    // ── A business stricter than the law tightens where Warning starts, never the Fail line ──
    [Fact]
    public void Hot_custom_target_65_flags_below_65_as_warning_but_above_60_is_not_fail()
    {
        var target = new TemperatureBand(65m, 68m);
        // 64 is legally safe (>= 60) but below the business target → Warning, not Fail.
        Assert.Equal(TemperatureResult.Warning, TemperatureEvaluator.Evaluate(FoodCategory.HotFood, 64m, target));
        Assert.Equal(TemperatureResult.Pass, TemperatureEvaluator.Evaluate(FoodCategory.HotFood, 66m, target));
        // The legal Fail line is unchanged by the custom target.
        Assert.Equal(TemperatureResult.Fail, TemperatureEvaluator.Evaluate(FoodCategory.HotFood, 59m, target));
    }

    [Fact]
    public void Cold_custom_target_3_flags_above_3_as_warning_but_within_8_is_not_fail()
    {
        var target = new TemperatureBand(0m, 3m);
        Assert.Equal(TemperatureResult.Warning, TemperatureEvaluator.Evaluate(FoodCategory.ColdFood, 4m, target));
        Assert.Equal(TemperatureResult.Pass, TemperatureEvaluator.Evaluate(FoodCategory.ColdFood, 2m, target));
        Assert.Equal(TemperatureResult.Fail, TemperatureEvaluator.Evaluate(FoodCategory.ColdFood, 9m, target));
    }

    [Fact]
    public void Default_target_bands_match_the_category_presets()
    {
        Assert.Equal(new TemperatureBand(63m, 70m), TemperatureEvaluator.DefaultTargetBand(FoodCategory.HotFood));
        Assert.Equal(new TemperatureBand(0m, 5m), TemperatureEvaluator.DefaultTargetBand(FoodCategory.ColdFood));
        Assert.Equal(new TemperatureBand(-30m, -18m), TemperatureEvaluator.DefaultTargetBand(FoodCategory.Frozen));
    }

    // ── A band LOOSER than the FSA guidance line must not hide the Warning tier ──────────────
    // Legacy/migrated units often stored the legal limit as their Min/Max (cold Max = 8, hot Min = 60)
    // under the old binary model. The evaluator clamps the effective Pass boundary to the guidance line
    // (63 hot / 5 cold) so a guidance breach still grades Warning instead of silently passing.
    [Fact]
    public void Cold_stored_band_up_to_the_legal_limit_still_flags_the_5_to_8_warning()
    {
        var looseBand = new TemperatureBand(0m, 8m); // ceiling looser than the 5°C guidance line
        Assert.Equal(TemperatureResult.Pass, TemperatureEvaluator.Evaluate(FoodCategory.ColdFood, 5m, looseBand));
        Assert.Equal(TemperatureResult.Warning, TemperatureEvaluator.Evaluate(FoodCategory.ColdFood, 5.1m, looseBand));
        Assert.Equal(TemperatureResult.Warning, TemperatureEvaluator.Evaluate(FoodCategory.ColdFood, 7m, looseBand));
        Assert.Equal(TemperatureResult.Warning, TemperatureEvaluator.Evaluate(FoodCategory.ColdFood, 8m, looseBand));
        Assert.Equal(TemperatureResult.Fail, TemperatureEvaluator.Evaluate(FoodCategory.ColdFood, 8.1m, looseBand));
    }

    [Fact]
    public void Hot_stored_band_down_to_the_legal_limit_still_flags_the_60_to_63_warning()
    {
        var looseBand = new TemperatureBand(60m, 70m); // floor looser than the 63°C guidance line
        Assert.Equal(TemperatureResult.Pass, TemperatureEvaluator.Evaluate(FoodCategory.HotFood, 63m, looseBand));
        Assert.Equal(TemperatureResult.Warning, TemperatureEvaluator.Evaluate(FoodCategory.HotFood, 62.9m, looseBand));
        Assert.Equal(TemperatureResult.Warning, TemperatureEvaluator.Evaluate(FoodCategory.HotFood, 61m, looseBand));
        Assert.Equal(TemperatureResult.Warning, TemperatureEvaluator.Evaluate(FoodCategory.HotFood, 60m, looseBand));
        Assert.Equal(TemperatureResult.Fail, TemperatureEvaluator.Evaluate(FoodCategory.HotFood, 59.9m, looseBand));
    }

    [Fact]
    public void Frozen_stored_band_looser_than_guidance_still_flags_the_warning()
    {
        var looseBand = new TemperatureBand(-30m, -12m); // ceiling looser than the -18°C guidance line
        Assert.Equal(TemperatureResult.Pass, TemperatureEvaluator.Evaluate(FoodCategory.Frozen, -18m, looseBand));
        Assert.Equal(TemperatureResult.Warning, TemperatureEvaluator.Evaluate(FoodCategory.Frozen, -17.9m, looseBand));
        Assert.Equal(TemperatureResult.Warning, TemperatureEvaluator.Evaluate(FoodCategory.Frozen, -12m, looseBand));
        Assert.Equal(TemperatureResult.Fail, TemperatureEvaluator.Evaluate(FoodCategory.Frozen, -11.9m, looseBand));
    }

    // A STRICTER-than-guidance band is honoured as-is (the clamp only tightens a loose band, never loosens).
    [Fact]
    public void Stricter_than_guidance_band_is_unchanged_by_the_clamp()
    {
        // Cold target ceiling 3 (< 5 guidance): 4°C must still be Warning, not clamped up to Pass.
        Assert.Equal(TemperatureResult.Warning, TemperatureEvaluator.Evaluate(FoodCategory.ColdFood, 4m, new TemperatureBand(0m, 3m)));
        // Hot target floor 65 (> 63 guidance): 64°C must still be Warning, not clamped down to Pass.
        Assert.Equal(TemperatureResult.Warning, TemperatureEvaluator.Evaluate(FoodCategory.HotFood, 64m, new TemperatureBand(65m, 68m)));
    }
}
