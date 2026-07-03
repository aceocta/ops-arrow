namespace ScratchCard.Domain.Enums;

public enum TemperatureEquipmentType
{
    Fridge = 1,
    Freezer = 2,
    CoolRoom = 3,
    DisplayChill = 4,
    HotFoodDisplay = 5,
    // Additional hot-holding appliances (spec §5) — all grade against the HotFood band.
    HotFoodCounter = 6,
    BainMarie = 7,
    PieWarmer = 8,
    Other = 99
}
