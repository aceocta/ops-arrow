using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.DTOs.TemperatureLogs;

public class TemperatureMonitoringUnitDto
{
    public Guid Id { get; set; }
    public Guid ShopId { get; set; }
    public string UnitName { get; set; } = string.Empty;
    public TemperatureEquipmentType EquipmentType { get; set; }
    public decimal MinTemperatureCelsius { get; set; }
    public decimal MaxTemperatureCelsius { get; set; }
    public bool IsActive { get; set; }
    public string? Location { get; set; }
    public string? Notes { get; set; }
    public int DisplayOrder { get; set; }
}

public class TemperatureScheduleDto
{
    public Guid Id { get; set; }
    public Guid ShopId { get; set; }
    public Guid? TemperatureMonitoringUnitId { get; set; }
    public string Label { get; set; } = string.Empty;
    public TimeOnly ExpectedTime { get; set; }
    public int ToleranceMinutes { get; set; }
    public bool IsActive { get; set; }
}

public class UpsertTemperatureScheduleRequest
{
    public Guid ShopId { get; set; }
    public Guid? TemperatureMonitoringUnitId { get; set; }
    public string Label { get; set; } = string.Empty;
    public TimeOnly ExpectedTime { get; set; }
    public int ToleranceMinutes { get; set; } = 30;
    public bool IsActive { get; set; } = true;
}

public class CreateTemperatureMonitoringUnitRequest
{
    public Guid ShopId { get; set; }
    public string UnitName { get; set; } = string.Empty;
    public TemperatureEquipmentType EquipmentType { get; set; }
    public decimal MinTemperatureCelsius { get; set; }
    public decimal MaxTemperatureCelsius { get; set; }
    public bool IsActive { get; set; } = true;
    public string? Location { get; set; }
    public string? Notes { get; set; }
    public int DisplayOrder { get; set; }
    // When true, taking an order number already in use shifts the other units down instead of failing.
    public bool ShiftConflicts { get; set; }
}

public class ReorderTemperatureUnitsRequest
{
    public Guid ShopId { get; set; }
    public IReadOnlyCollection<TemperatureUnitOrderItem> Items { get; set; } = [];
}

public class TemperatureUnitOrderItem
{
    public Guid UnitId { get; set; }
    public int DisplayOrder { get; set; }
}

public class UpdateTemperatureMonitoringUnitRequest
{
    public string UnitName { get; set; } = string.Empty;
    public TemperatureEquipmentType EquipmentType { get; set; }
    public decimal MinTemperatureCelsius { get; set; }
    public decimal MaxTemperatureCelsius { get; set; }
    public bool IsActive { get; set; } = true;
    public string? Location { get; set; }
    public string? Notes { get; set; }
    public int DisplayOrder { get; set; }
    // When true, taking an order number already in use shifts the other units down instead of failing.
    public bool ShiftConflicts { get; set; }
}

public class RecordTemperatureReadingRequest
{
    public Guid ShopId { get; set; }
    public Guid TemperatureMonitoringUnitId { get; set; }
    public DateOnly ReadingDate { get; set; }
    public TimeOnly ReadingTime { get; set; }
    public decimal TemperatureCelsius { get; set; }
    public string? CheckedByInitials { get; set; }
    public string? Notes { get; set; }
    public string? ActionTaken { get; set; }
    // The check this reading is logged against. Pass a scheduled slot's id to bind the reading to
    // that check (it is still evaluated late if outside the slot's tolerance), or the shop's random
    // schedule id for an ad-hoc/extra check. Null lets the server place it: it window-matches an
    // active scheduled slot, falling back to the shop's random-check bucket when none applies.
    public Guid? ScheduleId { get; set; }
}

public class TemperatureReadingDto
{
    public Guid Id { get; set; }
    public Guid ShopId { get; set; }
    public Guid TemperatureMonitoringUnitId { get; set; }
    public string UnitName { get; set; } = string.Empty;
    public TemperatureEquipmentType EquipmentType { get; set; }
    public decimal MinTemperatureCelsius { get; set; }
    public decimal MaxTemperatureCelsius { get; set; }
    public DateOnly ReadingDate { get; set; }
    public TimeOnly ReadingTime { get; set; }
    public decimal TemperatureCelsius { get; set; }
    public bool IsOutOfRange { get; set; }
    public string CheckedByInitials { get; set; } = string.Empty;
    public string? Notes { get; set; }
    public string? ActionTaken { get; set; }
    public DateTimeOffset RecordedOn { get; set; }
    public string? RecordedByName { get; set; }
    // Scheduled-check binding (null when no schedule matched this reading).
    public Guid? ScheduleId { get; set; }
    public string? ScheduleLabel { get; set; }
    public bool IsLateForSchedule { get; set; }
}

public enum TemperatureScheduleCellState
{
    Upcoming = 0,
    OnTime = 1,
    Late = 2,
    Missed = 3,
    // Logged before the slot's tolerance window (the reading still belongs to this slot).
    Early = 4
}

public class TemperatureScheduleGridSlotDto
{
    public Guid ScheduleId { get; set; }
    public Guid? UnitId { get; set; }
    public string Label { get; set; } = string.Empty;
    public TimeOnly ExpectedTime { get; set; }
    public int ToleranceMinutes { get; set; }
}

public class TemperatureScheduleGridUnitDto
{
    public Guid UnitId { get; set; }
    public string UnitName { get; set; } = string.Empty;
}

public class TemperatureScheduleGridCellDto
{
    public DateOnly Date { get; set; }
    public Guid UnitId { get; set; }
    public Guid ScheduleId { get; set; }
    public TemperatureScheduleCellState State { get; set; }
    public Guid? ReadingId { get; set; }
    public TimeOnly? ReadingTime { get; set; }
    public decimal? TemperatureCelsius { get; set; }
    public bool? IsOutOfRange { get; set; }
    public bool IsLate { get; set; }
}

public class TemperatureScheduleGridDto
{
    public DateOnly From { get; set; }
    public DateOnly To { get; set; }
    public IReadOnlyCollection<TemperatureScheduleGridUnitDto> Units { get; set; } = [];
    public IReadOnlyCollection<TemperatureScheduleGridSlotDto> Slots { get; set; } = [];
    public IReadOnlyCollection<TemperatureScheduleGridCellDto> Cells { get; set; } = [];
    public int OnTimeCount { get; set; }
    public int EarlyCount { get; set; }
    public int LateCount { get; set; }
    public int MissedCount { get; set; }
}

public class SignOffTemperatureDailyLogRequest
{
    public Guid ShopId { get; set; }
    public DateOnly SignoffDate { get; set; }
    public string? SignedByInitials { get; set; }
    public string? Notes { get; set; }
}

public class TemperatureDailySignoffDto
{
    public Guid Id { get; set; }
    public Guid ShopId { get; set; }
    public DateOnly SignoffDate { get; set; }
    public DateTimeOffset SignedOn { get; set; }
    public Guid SignedByUserId { get; set; }
    public string SignedByInitials { get; set; } = string.Empty;
    public string SignedByName { get; set; } = string.Empty;
    public string? Notes { get; set; }
}

public class TemperatureUnitDailyLogDto
{
    public TemperatureMonitoringUnitDto Unit { get; set; } = new();
    public IReadOnlyCollection<TemperatureReadingDto> Readings { get; set; } = [];
}

public class TemperatureDailyLogDto
{
    public Guid ShopId { get; set; }
    public DateOnly Date { get; set; }
    public TemperatureDailySignoffDto? Signoff { get; set; }
    public IReadOnlyCollection<TemperatureUnitDailyLogDto> Units { get; set; } = [];
}
