namespace ScratchCard.Domain.Enums;

/// <summary>
/// Food-safety category that drives the Pass/Warning/Fail temperature bands for a monitoring unit.
/// Distinct from <see cref="TemperatureEquipmentType"/> (the appliance): a Fridge, CoolRoom or
/// DisplayChill is <c>ColdFood</c>, a HotFoodDisplay is <c>HotFood</c>, a Freezer is <c>Frozen</c>.
/// </summary>
public enum FoodCategory
{
    HotFood = 1,
    ColdFood = 2,
    /// <summary>Freezers / frozen storage. Fail/warn thresholds here are PROVISIONAL pending sign-off
    /// (the requirements doc specifies only hot and cold numbers).</summary>
    Frozen = 3,
}

/// <summary>Three-tier verdict for a temperature reading — replaces the old binary in/out-of-range.</summary>
public enum TemperatureResult
{
    Pass = 1,
    Warning = 2,
    Fail = 3,
}

/// <summary>
/// Predefined corrective actions for a Warning/Fail reading or an equipment issue (spec §17). The
/// union of the hot and cold lists; the UI shows the subset appropriate to the unit's food category.
/// Stored as a comma-separated list of names on the reading/issue.
/// </summary>
public enum TemperatureCorrectiveAction
{
    TemperatureAdjusted = 1,
    FoodReheated = 2,
    MovedToAnotherHotUnit = 3,
    SoldWithinAllowedTime = 4,
    FoodDiscarded = 5,
    HotCabinetChecked = 6,
    MovedToAnotherFridge = 7,
    FridgeDoorClosed = 8,
    StockLevelReduced = 9,
    AirflowChecked = 10,
    TemperatureSettingChecked = 11,
    PowerSupplyChecked = 12,
    ManagerInformed = 13,
    EngineerContacted = 14,
    Other = 99,
}

/// <summary>
/// Working-status lifecycle of a monitoring unit. Deliberately SEPARATE from the reading verdict
/// (<see cref="TemperatureResult"/>): a hot cabinet can read Warning yet stay Working if staff confirm
/// the equipment is operating, and a fridge can read Fail and then be marked NotWorking.
/// </summary>
public enum EquipmentWorkingStatus
{
    Working = 1,
    TemperatureWarning = 2,
    NotWorking = 3,
    UnderMaintenance = 4,
    Resolved = 5,
    Inactive = 6,
}
