using ScratchCard.Domain.Common;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Domain.Entities;

public class BillingEvent : AuditableEntity
{
    public Guid CompanyId { get; set; }
    public Guid? CompanySubscriptionId { get; set; }
    public BillingEventType EventType { get; set; }
    public string Description { get; set; } = string.Empty;
    public string? OldValue { get; set; }
    public string? NewValue { get; set; }

    public Company Company { get; set; } = null!;
    public CompanySubscription? CompanySubscription { get; set; }
}
