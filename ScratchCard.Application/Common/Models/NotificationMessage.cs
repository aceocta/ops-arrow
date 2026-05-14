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
}
