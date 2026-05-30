using System.Threading.Channels;
using Microsoft.Extensions.Logging;

namespace ScratchCard.Infrastructure.Services;

/// <summary>
/// One audit-log write request. Captures all the data the AuditLog row needs so the background
/// worker can persist it without touching the original DbContext (which is request-scoped and
/// disposes the moment the controller returns).
/// </summary>
public sealed record AuditLogJob(
    string EntityName,
    Guid? EntityId,
    string ActionType,
    Guid? ShopId,
    string? OldValue,
    string? NewValue,
    string? Reason,
    Guid? ChangedByUserId,
    string? IpAddress,
    DateTimeOffset ChangedOn);

public sealed class AuditLogBackgroundQueue
{
    private readonly Channel<AuditLogJob> _channel;
    private readonly ILogger<AuditLogBackgroundQueue> _logger;

    public AuditLogBackgroundQueue(ILogger<AuditLogBackgroundQueue> logger)
    {
        _logger = logger;
        // Larger than the notification queue — audit volume is higher and losing an audit row is
        // mildly worse than losing a notification. Still bounded so a runaway producer can't OOM.
        _channel = Channel.CreateBounded<AuditLogJob>(new BoundedChannelOptions(4096)
        {
            FullMode = BoundedChannelFullMode.DropWrite,
            SingleReader = true,
            SingleWriter = false
        });
    }

    public void Enqueue(AuditLogJob job)
    {
        if (!_channel.Writer.TryWrite(job))
        {
            _logger.LogWarning(
                "Audit log queue full; dropped {ActionType} on {EntityName} ({EntityId}).",
                job.ActionType, job.EntityName, job.EntityId);
        }
    }

    public IAsyncEnumerable<AuditLogJob> ReadAllAsync(CancellationToken cancellationToken)
        => _channel.Reader.ReadAllAsync(cancellationToken);
}
