using ScratchCard.Application.DTOs.Common;

namespace ScratchCard.Application.DTOs.BusinessDays;

public class OpenBusinessDayRequest
{
    public Guid ShopId { get; set; }
    public DateOnly BusinessDate { get; set; }
}

public class CloseBusinessDayRequest
{
    public decimal LottoPayout { get; set; }
    public decimal ScratchCardPayout { get; set; }
    public decimal TillPayout { get; set; }
    public string? Notes { get; set; }
    public IReadOnlyCollection<CloseAttachmentUploadRequest> Attachments { get; set; } = [];
    public string? AttachmentFileName { get; set; }
    public string? AttachmentBase64 { get; set; }
}

public class ReopenBusinessDayRequest
{
    public string? Reason { get; set; }
}

public class CreateCanisterDropRequest
{
    public string CanisterNumber { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public string? DroppedByName { get; set; }
}

public class BusinessDayDto
{
    public Guid Id { get; set; }
    public Guid ShopId { get; set; }
    public DateOnly BusinessDate { get; set; }
    public string Status { get; set; } = string.Empty;
    public decimal TotalSalesAmount { get; set; }
    public decimal TotalPrizePayout { get; set; }
    public decimal ExpectedCash { get; set; }
    public decimal Difference { get; set; }
    public int MissingOpeningTicketCount { get; set; }
    public IReadOnlyCollection<MissingOpeningTicketDetailDto> MissingOpeningTicketDetails { get; set; } = [];
    public ScratchCardDayCloseSummaryDto? ScratchCardDayCloseSummary { get; set; }
    public IReadOnlyCollection<CloseAttachmentDto> CloseAttachments { get; set; } = [];
}

public class MissingOpeningTicketDetailDto
{
    public Guid ShiftId { get; set; }
    public string ShiftName { get; set; } = string.Empty;
    public Guid PackId { get; set; }
    public string PackNumber { get; set; } = string.Empty;
    public int? DisplayNumber { get; set; }
    public string GameName { get; set; } = string.Empty;
    public string GameCode { get; set; } = string.Empty;
    public string ExpectedOpeningSerialNumber { get; set; } = string.Empty;
    public string ActualOpeningSerialNumber { get; set; } = string.Empty;
    public int MissingQuantity { get; set; }
    public int OverageQuantity { get; set; }
}

public class ScratchCardDayCloseSummaryDto
{
    public decimal LottoPayout { get; set; }
    public decimal ScratchCardPayout { get; set; }
    public decimal TillPayout { get; set; }
}

public class CanisterDto
{
    public Guid Id { get; set; }
    public Guid ShopId { get; set; }
    public string CanisterNumber { get; set; } = string.Empty;
    public bool IsActive { get; set; }
}

public class CanisterDropDto
{
    public Guid Id { get; set; }
    public Guid ShopId { get; set; }
    public Guid BusinessDayId { get; set; }
    public Guid ShiftId { get; set; }
    public Guid CanisterId { get; set; }
    public string ShiftName { get; set; } = string.Empty;
    public string CanisterNumber { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public Guid? DroppedByUserId { get; set; }
    public string DroppedByName { get; set; } = string.Empty;
    public DateTimeOffset DroppedOn { get; set; }
}
