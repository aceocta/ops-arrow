namespace ScratchCard.Application.DTOs.Shifts;

public class OpenShiftRequest
{
    public Guid BusinessDayId { get; set; }
    public Guid ShopId { get; set; }
    public string ShiftName { get; set; } = string.Empty;
}

public class ReopenShiftRequest
{
    public string? Reason { get; set; }
}

public class ShiftDto
{
    public Guid Id { get; set; }
    public Guid BusinessDayId { get; set; }
    public Guid ShopId { get; set; }
    public string ShiftName { get; set; } = string.Empty;
    public DateTimeOffset StartTime { get; set; }
    public DateTimeOffset? EndTime { get; set; }
    public string Status { get; set; } = string.Empty;
    public string SyncStatus { get; set; } = string.Empty;
}
