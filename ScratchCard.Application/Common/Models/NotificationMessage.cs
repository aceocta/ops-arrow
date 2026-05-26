using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.Common.Models;

public class NotificationMessage
{
    public Guid ShopId { get; set; }
    public NotificationType NotificationType { get; set; }
    public NotificationChannel Channel { get; set; } = NotificationChannel.Email;
    public string Recipient { get; set; } = string.Empty;
    public string Subject { get; set; } = string.Empty;
    public string Body { get; set; } = string.Empty;
    public bool IsBodyHtml { get; set; }
    public IReadOnlyCollection<EmailAttachment> Attachments { get; set; } = [];
    public string RelatedEntityName { get; set; } = string.Empty;
    public Guid? RelatedEntityId { get; set; }

    // When true, the dispatcher requests high-priority delivery from the underlying transport
    // (email X-Priority/Importance header, push priority=high). The NotificationService demotes
    // this flag to false for shops on plans without notifications.priority so the lower-tier
    // shop's messages don't crowd the priority queue.
    public bool IsPriority { get; set; }
}
