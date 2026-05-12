using ScratchCard.Domain.Common;

namespace ScratchCard.Domain.Entities;

public class TemperatureReading : AuditableEntity
{
    public Guid ShopId { get; set; }
    public Guid TemperatureMonitoringUnitId { get; set; }
    public DateOnly ReadingDate { get; set; }
    public TimeOnly ReadingTime { get; set; }
    public decimal TemperatureCelsius { get; set; }
    public bool IsOutOfRange { get; set; }
    public string CheckedByInitials { get; set; } = string.Empty;
    public string? Notes { get; set; }
    public string? ActionTaken { get; set; }
    public DateTimeOffset RecordedOn { get; set; }
    public Guid? RecordedByUserId { get; set; }
    public string? RecordedByName { get; set; }

    public Shop Shop { get; set; } = null!;
    public TemperatureMonitoringUnit TemperatureMonitoringUnit { get; set; } = null!;
}
