using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.Services;

/// <summary>The unit's configurable ideal/target (Pass) range, in Celsius.</summary>
public readonly record struct TemperatureBand(decimal MinCelsius, decimal MaxCelsius);

/// <summary>
/// Single source of truth for the Pass / Warning / Fail food-safety verdict of a temperature reading,
/// shared by the recording path, the report grid and the alert sweeps so every surface grades a
/// reading identically. Pure and side-effect free; unit-tested at every boundary.
///
/// Two fixed ideas:
///  • <b>Legal FAIL lines are constants</b> (the law/FSA guidance): hot food is unsafe below 60&#176;C,
///    chilled food above 8&#176;C. These are NOT configurable.
///  • The unit's <b>target band is configurable</b> (defaults to the category preset). A business may be
///    stricter than the law — e.g. hold hot food at 65&#8211;68&#176;C — which tightens where Warning starts,
///    but can never loosen it: the effective Pass boundary is clamped to the FSA guidance line
///    (63&#176;C hot / 5&#176;C cold), so a legacy/migrated unit whose stored band is looser than guidance
///    still surfaces the Warning tier rather than silently grading a guidance-breach as Pass.
///
/// Direction differs by category: hot food is "warmer is safer" (concern = the lower bound); cold and
/// frozen are "colder is safer" (concern = the upper bound). Hot food above its target is still a Pass
/// (there is no upper-warning for hot food); cold/frozen below their target is still a Pass.
/// </summary>
public static class TemperatureEvaluator
{
    /// <summary>Hot food below this is a Fail (constant — the legal line).</summary>
    public const decimal HotFailBelowCelsius = 60m;

    /// <summary>Chilled food above this is a Fail (constant — the legal line).</summary>
    public const decimal ColdFailAboveCelsius = 8m;

    /// <summary>Frozen food above this is a Fail. PROVISIONAL — confirm the frozen bands before release.</summary>
    public const decimal FrozenFailAboveCelsius = -12m;

    /// <summary>Hot food is only a Pass at/above this FSA guidance line; 60&#8211;62.9&#176;C is a Warning. A unit's
    /// target floor may be stricter (higher) but the effective Pass floor is never allowed below this.</summary>
    public const decimal HotGuidancePassFloorCelsius = 63m;

    /// <summary>Chilled food is only a Pass at/below this FSA guidance line; 5.1&#8211;8&#176;C is a Warning. A unit's
    /// target ceiling may be stricter (lower) but the effective Pass ceiling is never allowed above this.</summary>
    public const decimal ColdGuidancePassCeilingCelsius = 5m;

    /// <summary>Frozen food is only a Pass at/below this ceiling. PROVISIONAL — confirm before release.</summary>
    public const decimal FrozenGuidancePassCeilingCelsius = -18m;

    /// <summary>Default ideal/target (Pass) band used when a unit doesn't specify its own.</summary>
    public static TemperatureBand DefaultTargetBand(FoodCategory category) => category switch
    {
        FoodCategory.HotFood => new TemperatureBand(63m, 70m),
        FoodCategory.ColdFood => new TemperatureBand(0m, 5m),
        FoodCategory.Frozen => new TemperatureBand(-30m, -18m),
        _ => new TemperatureBand(0m, 5m),
    };

    /// <summary>Grades a reading against the given target band (the unit's configurable ideal range).</summary>
    public static TemperatureResult Evaluate(FoodCategory category, decimal temperatureCelsius, TemperatureBand target)
    {
        switch (category)
        {
            case FoodCategory.HotFood:
                // Warmer is safer: Fail below the legal floor, Pass at/above the target floor, else Warning.
                // The Pass floor is clamped up to the guidance line so a looser stored band can't hide Warning.
                if (temperatureCelsius < HotFailBelowCelsius) return TemperatureResult.Fail;
                var hotPassFloor = Math.Max(target.MinCelsius, HotGuidancePassFloorCelsius);
                return temperatureCelsius >= hotPassFloor ? TemperatureResult.Pass : TemperatureResult.Warning;

            case FoodCategory.Frozen:
                // Colder is safer: Fail above the (provisional) frozen ceiling, Pass at/below target, else Warning.
                if (temperatureCelsius > FrozenFailAboveCelsius) return TemperatureResult.Fail;
                var frozenPassCeiling = Math.Min(target.MaxCelsius, FrozenGuidancePassCeilingCelsius);
                return temperatureCelsius <= frozenPassCeiling ? TemperatureResult.Pass : TemperatureResult.Warning;

            case FoodCategory.ColdFood:
            default:
                // Colder is safer: Fail above the legal ceiling, Pass at/below target, else Warning.
                // The Pass ceiling is clamped down to the guidance line so a looser stored band can't hide Warning.
                if (temperatureCelsius > ColdFailAboveCelsius) return TemperatureResult.Fail;
                var coldPassCeiling = Math.Min(target.MaxCelsius, ColdGuidancePassCeilingCelsius);
                return temperatureCelsius <= coldPassCeiling ? TemperatureResult.Pass : TemperatureResult.Warning;
        }
    }

    /// <summary>Grades a reading using the category's default target band.</summary>
    public static TemperatureResult Evaluate(FoodCategory category, decimal temperatureCelsius)
        => Evaluate(category, temperatureCelsius, DefaultTargetBand(category));
}
