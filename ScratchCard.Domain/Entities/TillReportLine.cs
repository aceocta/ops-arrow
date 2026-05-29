using ScratchCard.Domain.Common;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Domain.Entities;

public class TillReportLine : BaseEntity
{
    public Guid TillReportId { get; set; }
    public int LineNumber { get; set; }
    public string RawDescription { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public string? TypeCode { get; set; }
    public TillLineClassification Classification { get; set; } = TillLineClassification.Unclassified;
    public TillLineSource Source { get; set; } = TillLineSource.Unclassified;
    public Guid? MatchedRuleId { get; set; }
    public string? Notes { get; set; }

    public TillReport TillReport { get; set; } = null!;
}
