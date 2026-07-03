using ScratchCard.Domain.Common;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Domain.Entities;

public class TemperatureMonitoringUnit : SoftDeletableAuditableEntity
{
    public Guid ShopId { get; set; }
    public string UnitName { get; set; } = string.Empty;
    public TemperatureEquipmentType EquipmentType { get; set; } = TemperatureEquipmentType.Other;
    // Food-safety category driving the Pass/Warning/Fail bands. Distinct from EquipmentType (the appliance):
    // a HotFoodDisplay is HotFood, a Freezer is Frozen, everything else defaults to ColdFood.
    public FoodCategory FoodCategory { get; set; } = FoodCategory.ColdFood;
    // Min/Max is the unit's configurable *target* (Pass) band — the legal Warn/Fail lines are constants
    // in TemperatureEvaluator, so a business may hold stricter than the law but never looser.
    public decimal MinTemperatureCelsius { get; set; }
    public decimal MaxTemperatureCelsius { get; set; }
    public bool IsActive { get; set; } = true;
    // Working-status lifecycle, separate from the reading verdict and from IsActive (which marks a
    // retired unit). Denormalised here from the latest open TemperatureEquipmentIssue for fast list display.
    public EquipmentWorkingStatus CurrentWorkingStatus { get; set; } = EquipmentWorkingStatus.Working;
    public string? Location { get; set; }
    public string? Notes { get; set; }
    // Operator-defined position for ordering units in the grid/list and entry navigation.
    public int DisplayOrder { get; set; }

    public Shop Shop { get; set; } = null!;
    public ICollection<TemperatureReading> Readings { get; set; } = new List<TemperatureReading>();
    public ICollection<TemperatureEquipmentIssue> Issues { get; set; } = new List<TemperatureEquipmentIssue>();
    // Schedules that target this unit (via the TemperatureScheduleUnit join).
    public ICollection<TemperatureScheduleUnit> ScheduleLinks { get; set; } = new List<TemperatureScheduleUnit>();
}
