namespace ScratchCard.Application.DTOs.Reports;

public class DailySalesReportRowDto
{
    public DateOnly BusinessDate { get; set; }
    public string ShiftName { get; set; } = string.Empty;
    public int SoldQuantity { get; set; }
    public decimal SalesAmount { get; set; }
    public decimal PrizePayout { get; set; }
    public decimal ExpectedCash { get; set; }
    public decimal Difference { get; set; }
    public decimal? LottoPayout { get; set; }
    public decimal? ScratchCardPayout { get; set; }
    public decimal? TillPayout { get; set; }
}

public class ManualEntryReviewRowDto
{
    public DateOnly BusinessDate { get; set; }
    public string ShiftName { get; set; } = string.Empty;
    public string Cashier { get; set; } = string.Empty;
    public string PackNumber { get; set; } = string.Empty;
    public string GameName { get; set; } = string.Empty;
    public string OpeningSerial { get; set; } = string.Empty;
    public string? OriginalScannedSerial { get; set; }
    public string FinalClosingSerial { get; set; } = string.Empty;
    public string EntryMethod { get; set; } = string.Empty;
    public int SoldQuantity { get; set; }
    public decimal SalesAmount { get; set; }
    public string Reason { get; set; } = string.Empty;
    public bool NotificationSent { get; set; }
}

public class StockReportRowDto
{
    public string PackNumber { get; set; } = string.Empty;
    public string GameName { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string CurrentSerialNumber { get; set; } = string.Empty;
    public int RemainingTickets { get; set; }
}

public class SyncStatusReportRowDto
{
    public Guid ShiftId { get; set; }
    public string ShiftName { get; set; } = string.Empty;
    public DateTimeOffset StartTime { get; set; }
    public DateTimeOffset? EndTime { get; set; }
    public string Status { get; set; } = string.Empty;
}

public class AuditLogReportRowDto
{
    public Guid Id { get; set; }
    public DateTimeOffset ChangedOn { get; set; }
    public string EntityName { get; set; } = string.Empty;
    public Guid? EntityId { get; set; }
    public string ActionType { get; set; } = string.Empty;
    public Guid? ChangedByUserId { get; set; }
    public string? Reason { get; set; }
    public string? IpAddress { get; set; }
}

public class SendReportEmailRequest
{
    public string? RecipientEmail { get; set; }
    public string Subject { get; set; } = string.Empty;
    public string Body { get; set; } = string.Empty;
    public bool IsBodyHtml { get; set; } = true;
    public string? AttachmentFileName { get; set; }
    public string? AttachmentBase64 { get; set; }
}
