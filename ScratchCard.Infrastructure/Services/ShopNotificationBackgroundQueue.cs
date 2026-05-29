using System.Threading.Channels;
using Microsoft.Extensions.Logging;
using ScratchCard.Application.Common.Interfaces;

namespace ScratchCard.Infrastructure.Services;

/// <summary>
/// In-process background queue for shop/subscription notifications. Enqueue is non-blocking and
/// never throws: if the bounded buffer is full the job is dropped (with a warning) rather than
/// blocking or failing the calling business operation.
/// </summary>
public sealed class ShopNotificationBackgroundQueue : IShopNotificationDispatcher
{
    private readonly Channel<ShopNotificationJob> _channel;
    private readonly ILogger<ShopNotificationBackgroundQueue> _logger;

    public ShopNotificationBackgroundQueue(ILogger<ShopNotificationBackgroundQueue> logger)
    {
        _logger = logger;
        _channel = Channel.CreateBounded<ShopNotificationJob>(new BoundedChannelOptions(512)
        {
            FullMode = BoundedChannelFullMode.DropWrite,
            SingleReader = true,
            SingleWriter = false
        });
    }

    public void Enqueue(ShopNotificationJob job)
    {
        if (!_channel.Writer.TryWrite(job))
        {
            _logger.LogWarning(
                "Shop notification queue full; dropped {Kind} notification for shop {ShopId}.",
                job.Kind, job.ShopId);
        }
    }

    public IAsyncEnumerable<ShopNotificationJob> ReadAllAsync(CancellationToken cancellationToken)
        => _channel.Reader.ReadAllAsync(cancellationToken);
}
