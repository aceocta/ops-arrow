using ScratchCard.Application.DTOs.TemperatureLogs;
using ScratchCard.Application.Services;
using ScratchCard.Domain.Entities;
using Xunit;

namespace ScratchCard.Tests;

// Temperature schedule windowing decides which scheduled check a reading belongs to and whether it
// was on-time / early / late / missed — shared by recording, the report grid, and missed-alert
// sweeps. If this drifts, compliance records mis-grade fridge/freezer checks.
public class TemperatureScheduleWindowsTests
{
    private static CfgTemperatureSchedule Slot(int hour, int minute = 0, int tolerance = 30, Guid? unitId = null)
        => new() { ExpectedTime = new TimeOnly(hour, minute), ToleranceMinutes = tolerance, TemperatureMonitoringUnitId = unitId };

    // ── IsLate: only after expected + tolerance ──────────────────────────────
    [Fact]
    public void OnTime_reading_is_not_late()
        => Assert.False(TemperatureScheduleWindows.IsLate(Slot(9), new TimeOnly(9, 20)));

    [Fact]
    public void Reading_after_tolerance_is_late()
        => Assert.True(TemperatureScheduleWindows.IsLate(Slot(9), new TimeOnly(9, 45)));

    [Fact]
    public void Early_reading_is_not_late()
        => Assert.False(TemperatureScheduleWindows.IsLate(Slot(9), new TimeOnly(8, 0)));

    [Fact]
    public void At_exact_tolerance_boundary_is_not_late()
        => Assert.False(TemperatureScheduleWindows.IsLate(Slot(9), new TimeOnly(9, 30)));

    // ── IsOutsideTolerance: symmetric (early or late) ────────────────────────
    [Theory]
    [InlineData(9, 20, false)] // within
    [InlineData(9, 30, false)] // boundary inclusive
    [InlineData(9, 45, true)]  // late
    [InlineData(8, 20, true)]  // early beyond tolerance
    public void IsOutsideTolerance_flags_only_beyond_band(int h, int m, bool expected)
        => Assert.Equal(expected, TemperatureScheduleWindows.IsOutsideTolerance(Slot(9), new TimeOnly(h, m)));

    // ── Classify: Early / OnTime / Late ──────────────────────────────────────
    [Theory]
    [InlineData(8, 0, TemperatureScheduleCellState.Early)]
    [InlineData(9, 0, TemperatureScheduleCellState.OnTime)]
    [InlineData(9, 25, TemperatureScheduleCellState.OnTime)]
    [InlineData(10, 0, TemperatureScheduleCellState.Late)]
    public void Classify_assigns_state(int h, int m, TemperatureScheduleCellState expected)
        => Assert.Equal(expected, TemperatureScheduleWindows.Classify(Slot(9), new TimeOnly(h, m)));

    // ── AssignIndex: last slot whose expected time is ≤ reading ──────────────
    [Theory]
    [InlineData(8, 0, 0)]   // before first → first slot
    [InlineData(12, 59, 0)] // still in the 09:00 window
    [InlineData(13, 0, 1)]  // boundary lands in the 13:00 slot
    [InlineData(18, 0, 2)]  // after last → last slot
    public void AssignIndex_picks_owning_slot(int h, int m, int expectedIndex)
    {
        var sorted = TemperatureScheduleWindows.SortByTime(new[] { Slot(9), Slot(13), Slot(17) });
        Assert.Equal(expectedIndex, TemperatureScheduleWindows.AssignIndex(sorted, new TimeOnly(h, m)));
    }

    [Fact]
    public void AssignIndex_returns_minus_one_when_no_slots()
        => Assert.Equal(-1, TemperatureScheduleWindows.AssignIndex(new List<CfgTemperatureSchedule>(), new TimeOnly(9, 0)));

    // ── SortByTime: orders by time; on a tie a unit-specific slot sorts last ──
    [Fact]
    public void SortByTime_unit_specific_slot_wins_on_time_tie()
    {
        var shopWide = Slot(9);
        var unitSpecific = Slot(9, unitId: Guid.NewGuid());
        var sorted = TemperatureScheduleWindows.SortByTime(new[] { unitSpecific, shopWide });
        Assert.Same(shopWide, sorted[0]);
        Assert.Same(unitSpecific, sorted[1]);
    }

    [Fact]
    public void DistanceToExpected_is_absolute()
    {
        Assert.Equal(TimeSpan.FromMinutes(15), TemperatureScheduleWindows.DistanceToExpected(Slot(9), new TimeOnly(8, 45)));
        Assert.Equal(TimeSpan.FromMinutes(15), TemperatureScheduleWindows.DistanceToExpected(Slot(9), new TimeOnly(9, 15)));
    }
}
