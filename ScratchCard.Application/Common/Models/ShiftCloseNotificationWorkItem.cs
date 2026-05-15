namespace ScratchCard.Application.Common.Models;

public sealed class ShiftCloseNotificationWorkItem
{
    public Guid ShiftId { get; init; }
    public bool IncludeManualEntryNotifications { get; init; }
}
