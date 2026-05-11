namespace ScratchCard.Domain.Enums;

public enum SyncStatus
{
    Draft = 1,
    PendingSync = 2,
    Syncing = 3,
    Synced = 4,
    SyncFailed = 5,
    Conflict = 6
}
