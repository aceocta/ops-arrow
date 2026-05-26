using ScratchCard.Domain.Common;

namespace ScratchCard.Domain.Entities;

// Per-shop schedule defining when temperature readings are expected during the day. Each row
// represents one expected slot (e.g. 09:00 morning check). Plans without
// temperature_log.scheduled_checks ignore these rows entirely; plans with the feature use
// them both to nudge users (via TemperatureMissedAlertsBackgroundService) and to validate
// that recorded readings fall within a slot window.
public class CfgTemperatureSchedule : AuditableEntity
{
    public Guid ShopId { get; set; }
    public Guid? TemperatureMonitoringUnitId { get; set; }
    public TimeOnly ExpectedTime { get; set; }
    public int ToleranceMinutes { get; set; } = 30;
    public string Label { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;

    public Shop Shop { get; set; } = null!;
    public TemperatureMonitoringUnit? TemperatureMonitoringUnit { get; set; }
}
