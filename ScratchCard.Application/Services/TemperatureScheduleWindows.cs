using ScratchCard.Application.DTOs.TemperatureLogs;
using ScratchCard.Domain.Entities;

namespace ScratchCard.Application.Services;

/// <summary>
/// Window-based assignment of temperature readings to scheduled checks, shared by the recording
/// path (slot claim) and the schedule-grid report so both classify readings identically — and so
/// they match the mobile temperature-log screen.
///
/// Each active schedule "owns" the time from its own expected time up to the next schedule's
/// expected time. A reading falls into the last slot whose expected time is at or before the
/// reading time (readings before the first slot fall into that first slot). Within its slot a
/// reading is OnTime inside the tolerance band, Early before it, Late after it. A slot with no
/// reading assigned to it is therefore Missed once its window has passed.
/// </summary>
public static class TemperatureScheduleWindows
{
    /// <summary>A schedule applies to a unit when it links that unit, or has no unit links at all
    /// (the all-units / shop-wide case).</summary>
    public static bool AppliesToUnit(ISet<Guid> linkedUnitIds, Guid unitId)
        => linkedUnitIds.Count == 0 || linkedUnitIds.Contains(unitId);

    /// <summary>
    /// Orders schedules by expected time. On an exact time tie a unit-specific schedule (one whose id
    /// is in <paramref name="unitSpecificScheduleIds"/>) sorts last so it wins assignment for that unit
    /// (see <see cref="AssignIndex"/>, which keeps the last match). The caller builds the set per unit:
    /// a schedule is unit-specific for unit u when its link set is non-empty AND contains u.
    /// </summary>
    public static List<CfgTemperatureSchedule> SortByTime(IEnumerable<CfgTemperatureSchedule> schedules, ISet<Guid> unitSpecificScheduleIds)
        => schedules
            .OrderBy(s => s.ExpectedTime)
            .ThenBy(s => unitSpecificScheduleIds.Contains(s.Id) ? 1 : 0)
            .ToList();

    /// <summary>
    /// Index of the slot whose window contains <paramref name="readingTime"/> — the last slot
    /// whose expected time is at or before it. Returns 0 for readings before the first slot, and
    /// -1 only when there are no slots. <paramref name="sorted"/> must come from <see cref="SortByTime"/>.
    /// </summary>
    public static int AssignIndex(IReadOnlyList<CfgTemperatureSchedule> sorted, TimeOnly readingTime)
    {
        if (sorted.Count == 0) return -1;
        var index = 0;
        for (var i = 0; i < sorted.Count; i++)
        {
            if (sorted[i].ExpectedTime <= readingTime) index = i;
        }
        return index;
    }

    /// <summary>True when the reading lies outside the slot's tolerance band (early or late).</summary>
    public static bool IsOutsideTolerance(CfgTemperatureSchedule slot, TimeOnly readingTime)
    {
        var tolerance = TimeSpan.FromMinutes(Math.Max(0, slot.ToleranceMinutes));
        var delta = (readingTime.ToTimeSpan() - slot.ExpectedTime.ToTimeSpan()).Duration();
        return delta > tolerance;
    }

    /// <summary>True only when the reading is after the slot's expected time plus tolerance (late);
    /// an early reading is not late.</summary>
    public static bool IsLate(CfgTemperatureSchedule slot, TimeOnly readingTime)
    {
        var tolerance = TimeSpan.FromMinutes(Math.Max(0, slot.ToleranceMinutes));
        return readingTime.ToTimeSpan() > slot.ExpectedTime.ToTimeSpan() + tolerance;
    }

    /// <summary>Classifies a reading relative to its assigned slot.</summary>
    public static TemperatureScheduleCellState Classify(CfgTemperatureSchedule slot, TimeOnly readingTime)
    {
        var tolerance = TimeSpan.FromMinutes(Math.Max(0, slot.ToleranceMinutes));
        var expected = slot.ExpectedTime.ToTimeSpan();
        var actual = readingTime.ToTimeSpan();
        if (actual < expected - tolerance) return TemperatureScheduleCellState.Early;
        if (actual > expected + tolerance) return TemperatureScheduleCellState.Late;
        return TemperatureScheduleCellState.OnTime;
    }

    /// <summary>Absolute distance from the slot's expected time — used to pick a slot's representative reading.</summary>
    public static TimeSpan DistanceToExpected(CfgTemperatureSchedule slot, TimeOnly readingTime)
        => (readingTime.ToTimeSpan() - slot.ExpectedTime.ToTimeSpan()).Duration();
}
