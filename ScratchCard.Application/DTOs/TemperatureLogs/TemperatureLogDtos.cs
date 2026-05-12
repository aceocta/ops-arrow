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
