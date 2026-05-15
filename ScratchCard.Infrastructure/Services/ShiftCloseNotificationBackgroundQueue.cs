using System.Threading.Channels;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Models;

namespace ScratchCard.Infrastructure.Services;

public sealed class ShiftCloseNotificationBackgroundQueue : IShiftCloseNotificationDispatcher
{
    private readonly Channel<ShiftCloseNotificationWorkItem> _channel;

    public ShiftCloseNotificationBackgroundQueue()
    {
        _channel = Channel.CreateBounded<ShiftCloseNotificationWorkItem>(new BoundedChannelOptions(512)
        {
            FullMode = BoundedChannelFullMode.Wait,
            SingleReader = true,
            SingleWriter = false
        });
    }

    public ValueTask EnqueueAsync(ShiftCloseNotificationWorkItem workItem, CancellationToken cancellationToken = default)
        => _channel.Writer.WriteAsync(workItem, cancellationToken);

    public IAsyncEnumerable<ShiftCloseNotificationWorkItem> ReadAllAsync(CancellationToken cancellationToken)
        => _channel.Reader.ReadAllAsync(cancellationToken);
}
