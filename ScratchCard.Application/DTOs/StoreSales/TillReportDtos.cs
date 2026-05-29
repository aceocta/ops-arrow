using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.DTOs.StoreSales;

public class TillReportDto
{
    public Guid Id { get; set; }
    public Guid ShopId { get; set; }
    public TillReportType ReportType { get; set; }
    public Guid? ShiftId { get; set; }
    public Guid? BusinessDayId { get; set; }
    public string BusinessDate { get; set; } = string.Empty;
    public TillReportStatus Status { get; set; }
    public decimal TotalIncome { get; set; }
    public decimal TotalExpense { get; set; }
    public decimal Net { get; set; }
    public int LineCount { get; set; }
    public int UnclassifiedCount { get; set; }
    public int AttachmentCount { get; set; }
    public DateTimeOffset ProcessedOn { get; set; }
    public DateTimeOffset? ConfirmedOn { get; set; }
    public IReadOnlyCollection<TillReportLineDto> Lines { get; set; } = [];
    public IReadOnlyCollection<TillReportAttachmentDto> Attachments { get; set; } = [];
    public IReadOnlyCollection<TillReportPaymentDto> Payments { get; set; } = [];
}

public class TillReportPaymentDto
{
    public Guid Id { get; set; }
    public TillPaymentType PaymentType { get; set; }
    public decimal Amount { get; set; }
    public TillLineSource Source { get; set; }
}

public class TillReportAttachmentDto
{
    public Guid Id { get; set; }
    public int PageNumber { get; set; }
    public string OriginalFileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
}

public class TillReportLineDto
{
    public Guid Id { get; set; }
    public int LineNumber { get; set; }
    public string RawDescription { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public string? TypeCode { get; set; }
    public TillLineClassification Classification { get; set; }
    public TillLineSource Source { get; set; }
    public Guid? MatchedRuleId { get; set; }
    public string? Notes { get; set; }
}

public class TillReportListItemDto
{
    public Guid Id { get; set; }
    public Guid ShopId { get; set; }
    public TillReportType ReportType { get; set; }
    public Guid? ShiftId { get; set; }
    public string BusinessDate { get; set; } = string.Empty;
    public TillReportStatus Status { get; set; }
    public decimal TotalIncome { get; set; }
    public decimal TotalExpense { get; set; }
    public decimal Net { get; set; }
    public int LineCount { get; set; }
    public int UnclassifiedCount { get; set; }
    public DateTimeOffset ProcessedOn { get; set; }
}

public class ProcessTillReportRequest
{
    public Guid ShopId { get; set; }
    public TillReportType ReportType { get; set; } = TillReportType.DayEnd;
    public Guid? ShiftId { get; set; }
    public Guid? BusinessDayId { get; set; }
    public IReadOnlyList<TillReportFile> Files { get; set; } = [];
}

public class TillReportFile
{
    public byte[] Bytes { get; set; } = [];
    public string ContentType { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
}

public class ReclassifyLineRequest
{
    public TillLineClassification Classification { get; set; }
}

public class UpsertTillPaymentRequest
{
    public TillPaymentType PaymentType { get; set; }
    public decimal Amount { get; set; }
}

public class TillPaymentTypeAmountDto
{
    public TillPaymentType PaymentType { get; set; }
    public decimal Amount { get; set; }
}

public class TillShiftPaymentSummaryDto
{
    public Guid ShiftId { get; set; }
    public string ShiftName { get; set; } = string.Empty;
    public IReadOnlyCollection<TillPaymentTypeAmountDto> Totals { get; set; } = [];
}

public class TillReportScopeSummaryDto
{
    public decimal TotalSales { get; set; }
    public decimal Payouts { get; set; }
    public decimal Net { get; set; }
    public decimal Cash { get; set; }
    public decimal Card { get; set; }
    public decimal Other { get; set; }
    public int ReportCount { get; set; }
}

public class TillPaymentSummaryDto
{
    public Guid BusinessDayId { get; set; }
    public string BusinessDate { get; set; } = string.Empty;
    // Whole-day tender totals (from day-end reports, or shift reports if no day-end exists).
    public IReadOnlyCollection<TillPaymentTypeAmountDto> DayTotals { get; set; } = [];
    // Per-shift tender totals (from shift reports).
    public IReadOnlyCollection<TillShiftPaymentSummaryDto> Shifts { get; set; } = [];
}

public class TillCategoryRuleDto
{
    public Guid Id { get; set; }
    public Guid ShopId { get; set; }
    public string Pattern { get; set; } = string.Empty;
    public TillRuleMatchType MatchType { get; set; }
    public TillLineClassification Classification { get; set; }
    public int Priority { get; set; }
    public bool IsActive { get; set; }
}

public class CreateTillRuleRequest
{
    public Guid ShopId { get; set; }
    public string Pattern { get; set; } = string.Empty;
    public TillRuleMatchType MatchType { get; set; } = TillRuleMatchType.Contains;
    public TillLineClassification Classification { get; set; } = TillLineClassification.Income;
    public int Priority { get; set; }
}
