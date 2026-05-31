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

public class RegisterPushTokenRequest
{
    public Guid ShopId { get; set; }
    public string PushToken { get; set; } = string.Empty;
    public string Platform { get; set; } = string.Empty;
    public string? DeviceName { get; set; }
}

public class UnregisterPushTokenRequest
{
    public Guid ShopId { get; set; }
    public string PushToken { get; set; } = string.Empty;
}

/// <summary>
/// Per-device outcome from the test-push diagnostic. One row per registered UserPushToken
/// belonging to the target user. `Sent = true` means Firebase accepted the message; it does
/// NOT prove the device's OS displayed the notification (Android POST_NOTIFICATIONS, "Do Not
/// Disturb", or app-foreground state can still suppress it). When Sent = false, FailureReason
/// carries the Firebase error message verbatim so you can grep for codes like UNREGISTERED.
/// </summary>
public class TestPushResultDto
{
    public Guid UserId { get; set; }
    public string? UserEmail { get; set; }
    public int TokensRegistered { get; set; }
    public int SentSuccessfully { get; set; }
    public int FailedCount { get; set; }
    public IReadOnlyCollection<TestPushTokenResult> PerToken { get; set; } = [];
}

public class TestPushTokenResult
{
    public Guid TokenId { get; set; }
    public string? Platform { get; set; }
    public string? DeviceName { get; set; }
    public string TokenPreview { get; set; } = string.Empty;
    public bool Sent { get; set; }
    public string? FailureReason { get; set; }
    public DateTimeOffset? CreatedOn { get; set; }
    public DateTimeOffset? LastUsedOn { get; set; }
}
