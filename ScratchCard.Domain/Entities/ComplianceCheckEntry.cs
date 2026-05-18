using ScratchCard.Domain.Common;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Domain.Entities;

public class ComplianceCheckEntry : AuditableEntity
{
    public Guid ShopId { get; set; }
    public Guid? CompanyId { get; set; }
    public Guid ComplianceCheckItemId { get; set; }
    public ComplianceCheckFrequency Frequency { get; set; } = ComplianceCheckFrequency.Daily;
    public DateOnly PeriodDate { get; set; }
    public ComplianceCheckResult Result { get; set; } = ComplianceCheckResult.Pending;
    public string? Notes { get; set; }
    public string? ActionRequired { get; set; }
    public Guid? CheckedByUserId { get; set; }
    public string? CheckedByName { get; set; }
    public DateTimeOffset? CheckedOn { get; set; }
    public bool IsActionClosedOut { get; set; }
    public string? ClosedOutNotes { get; set; }
    public Guid? ClosedOutByUserId { get; set; }
    public string? ClosedOutByName { get; set; }
    public DateTimeOffset? ClosedOutOn { get; set; }

    public Shop Shop { get; set; } = null!;
    public ComplianceCheckItem ComplianceCheckItem { get; set; } = null!;
}
