namespace ScratchCard.Application.DTOs.Notifications;

public class NotificationLogDto
{
    public Guid Id { get; set; }
    public string NotificationType { get; set; } = string.Empty;
    public string Channel { get; set; } = string.Empty;
    public string Recipient { get; set; } = string.Empty;
    public string Subject { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public DateTimeOffset? SentOn { get; set; }
    public string? FailedReason { get; set; }
}
