using ScratchCard.Domain.Common;

namespace ScratchCard.Domain.Entities;

/// <summary>
/// Links a temperature-check schedule to a monitoring unit (many-to-many). One schedule can cover
/// several units (e.g. a single 09:00 slot for two fridges). A schedule with ZERO links applies to
/// ALL units — this preserves the previous CfgTemperatureSchedule.TemperatureMonitoringUnitId == null
/// ("shop-wide") semantics. A unique index on (ScheduleId, TemperatureMonitoringUnitId) prevents
/// duplicate links.
/// </summary>
public class TemperatureScheduleUnit : BaseEntity
{
    public Guid ScheduleId { get; set; }
    public Guid TemperatureMonitoringUnitId { get; set; }

    public CfgTemperatureSchedule Schedule { get; set; } = null!;
    public TemperatureMonitoringUnit TemperatureMonitoringUnit { get; set; } = null!;
}
