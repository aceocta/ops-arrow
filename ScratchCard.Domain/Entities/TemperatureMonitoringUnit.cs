using ScratchCard.Domain.Common;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Domain.Entities;

public class TemperatureMonitoringUnit : SoftDeletableAuditableEntity
{
    public Guid ShopId { get; set; }
    public string UnitName { get; set; } = string.Empty;
    public TemperatureEquipmentType EquipmentType { get; set; } = TemperatureEquipmentType.Other;
    public decimal MinTemperatureCelsius { get; set; }
    public decimal MaxTemperatureCelsius { get; set; }
    public bool IsActive { get; set; } = true;
    public string? Location { get; set; }
    public string? Notes { get; set; }

    public Shop Shop { get; set; } = null!;
    public ICollection<TemperatureReading> Readings { get; set; } = new List<TemperatureReading>();
}
