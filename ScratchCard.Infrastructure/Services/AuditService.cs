using ScratchCard.Application.Common.Interfaces;

namespace ScratchCard.Infrastructure.Services;

public class AuditService : IAuditService
{
    private readonly AuditLogBackgroundQueue _queue;
    private readonly ICurrentUserService _currentUserService;

    public AuditService(AuditLogBackgroundQueue queue, ICurrentUserService currentUserService)
    {
        _queue = queue;
        _currentUserService = currentUserService;
    }

    public Task LogAsync(
        string entityName,
        Guid? entityId,
        string actionType,
        Guid? shopId = null,
        string? oldValue = null,
        string? newValue = null,
        string? reason = null,
        CancellationToken cancellationToken = default)
    {
        // Fire-and-forget enqueue — the AuditLogBackgroundService drains the channel and persists
        // with its own scoped DbContext. Removes a second DB round-trip from every mutation.
        _queue.Enqueue(new AuditLogJob(
            EntityName: entityName,
            EntityId: entityId,
            ActionType: actionType,
            ShopId: shopId,
            OldValue: oldValue,
            NewValue: newValue,
            Reason: reason,
            ChangedByUserId: _currentUserService.UserId,
            IpAddress: _currentUserService.IpAddress,
            ChangedOn: DateTimeOffset.UtcNow));

        return Task.CompletedTask;
    }
}
