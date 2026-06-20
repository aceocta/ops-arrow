using ScratchCard.Domain.Common;

namespace ScratchCard.Domain.Entities;

// Per-shop schedule defining when temperature readings are expected during the day. Each row
// represents one expected slot (e.g. 09:00 morning check). Plans without
// temperature_log.scheduled_checks ignore these rows entirely; plans with the feature use
// them both to nudge users (via TemperatureMissedAlertsBackgroundService) and to validate
// that recorded readings fall within a slot window.
//
// A schedule targets a SET of units via <see cref="Units"/> (a many-to-many through
// TemperatureScheduleUnit): one schedule can cover several units. A schedule with ZERO unit links
// applies to ALL units (the "shop-wide" case that was previously TemperatureMonitoringUnitId == null).
public class CfgTemperatureSchedule : AuditableEntity
{
    public Guid ShopId { get; set; }
    public TimeOnly ExpectedTime { get; set; }
    public int ToleranceMinutes { get; set; } = 30;
    public string Label { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;

    // True for the single per-shop "Random check" bucket row. A random schedule has no meaningful
    // ExpectedTime/ToleranceMinutes — readings bound to it are ad-hoc/extra checks that are never
    // evaluated for early/late/missed. It is excluded from the schedule-management list, the report
    // grid, the time-window matcher, and missed-alert sweeps. Enforced unique per shop by a filtered
    // index (see ApplicationDbContext). A shop has at most one.
    public bool IsRandom { get; set; }

    public Shop Shop { get; set; } = null!;
    // The units this schedule covers. Empty == all units (shop-wide).
    public ICollection<TemperatureScheduleUnit> Units { get; set; } = new List<TemperatureScheduleUnit>();
}
