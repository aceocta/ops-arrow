using ScratchCard.Domain.Common;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Domain.Entities;

public class NotificationLog : AuditableEntity
{
    public Guid ShopId { get; set; }
    public NotificationType NotificationType { get; set; }
    public NotificationChannel Channel { get; set; }
    public string Recipient { get; set; } = string.Empty;
    public string Subject { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public NotificationStatus Status { get; set; } = NotificationStatus.Pending;
    public DateTimeOffset? SentOn { get; set; }
    public string? FailedReason { get; set; }
    public string RelatedEntityName { get; set; } = string.Empty;
    public Guid? RelatedEntityId { get; set; }

    public Shop Shop { get; set; } = null!;
}
