using ScratchCard.Application.DTOs.Common;

namespace ScratchCard.Application.DTOs.Shifts;

public class OpenShiftRequest
{
    public Guid BusinessDayId { get; set; }
    public Guid ShopId { get; set; }
    public string? ShiftName { get; set; }
    public IReadOnlyCollection<OpenShiftPackSerialConfirmationRequest> OpeningSerialConfirmations { get; set; } = [];
}

public class StartScheduledShiftRequest
{
    public IReadOnlyCollection<OpenShiftPackSerialConfirmationRequest> OpeningSerialConfirmations { get; set; } = [];
}

public class OpenShiftPackSerialConfirmationRequest
{
    public Guid PackId { get; set; }
    public string OpeningSerialNumber { get; set; } = string.Empty;
}

public class ReopenShiftRequest
{
    public string? Reason { get; set; }
}

public class DeleteShiftRequest
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
    public bool IsAutoCreated { get; set; }
    public string? AutoTemplateId { get; set; }
    public IReadOnlyCollection<CloseAttachmentDto> CloseAttachments { get; set; } = [];
}

public class ShiftCloseCandidateDto
{
    public Guid Id { get; set; }
    public Guid ShopId { get; set; }
    public Guid BusinessDayId { get; set; }
    public DateOnly BusinessDate { get; set; }
    public string BusinessDayStatus { get; set; } = string.Empty;
    public string ShiftName { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string SyncStatus { get; set; } = string.Empty;
    public DateTimeOffset StartTime { get; set; }
    public DateTimeOffset? EndTime { get; set; }
}
