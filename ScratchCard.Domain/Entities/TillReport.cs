using ScratchCard.Domain.Common;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Domain.Entities;

public class TillReport : SoftDeletableAuditableEntity
{
    public Guid ShopId { get; set; }
    // The physical till the report came from. Nullable so older single-till shops aren't blocked,
    // but the service requires it when the shop has any configured tills.
    public Guid? TillId { get; set; }
    // A till report is scoped to either a single shift or the whole business day.
    public TillReportType ReportType { get; set; } = TillReportType.DayEnd;
    public Guid? ShiftId { get; set; }
    public Guid? BusinessDayId { get; set; }
    public DateOnly BusinessDate { get; set; }
    public TillReportStatus Status { get; set; } = TillReportStatus.NeedsReview;

    // Full OCR text is retained locally only; never sent to third parties.
    public string? OcrRawText { get; set; }

    public decimal TotalIncome { get; set; }
    public decimal TotalExpense { get; set; }
    public int LineCount { get; set; }

    public DateTimeOffset ProcessedOn { get; set; }
    public Guid? ConfirmedByUserId { get; set; }
    public DateTimeOffset? ConfirmedOn { get; set; }

    public Shop Shop { get; set; } = null!;
    public Till? Till { get; set; }
    public Shift? Shift { get; set; }
    public BusinessDay? BusinessDay { get; set; }
    public ICollection<TillReportLine> Lines { get; set; } = new List<TillReportLine>();
    // One till report can be assembled from several photos.
    public ICollection<TillReportAttachment> Attachments { get; set; } = new List<TillReportAttachment>();
    // Tender breakdown (Cash / Card / Other) — a separate axis from income/expense lines.
    public ICollection<TillReportPayment> Payments { get; set; } = new List<TillReportPayment>();
}
