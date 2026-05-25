using ScratchCard.Domain.Common;

namespace ScratchCard.Domain.Entities;

/// <summary>
/// Counts report exports per shop per month. Used by FeatureGateService to enforce the
/// "X report exports per month" quota in each subscription plan.
/// </summary>
public class ReportExportLog : AuditableEntity
{
    public Guid ShopId { get; set; }
    public string ReportType { get; set; } = string.Empty;
    public DateTimeOffset ExportedOn { get; set; } = DateTimeOffset.UtcNow;
}
