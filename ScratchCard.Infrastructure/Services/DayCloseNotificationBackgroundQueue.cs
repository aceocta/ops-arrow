using System.Threading.Channels;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Models;

namespace ScratchCard.Infrastructure.Services;

public sealed class DayCloseNotificationBackgroundQueue : IDayCloseNotificationDispatcher
{
    private readonly Channel<DayCloseNotificationWorkItem> _channel;

    public DayCloseNotificationBackgroundQueue()
    {
        _channel = Channel.CreateBounded<DayCloseNotificationWorkItem>(new BoundedChannelOptions(512)
        {
            FullMode = BoundedChannelFullMode.Wait,
            SingleReader = true,
            SingleWriter = false
        });
    }

    public ValueTask EnqueueAsync(DayCloseNotificationWorkItem workItem, CancellationToken cancellationToken = default)
        => _channel.Writer.WriteAsync(workItem, cancellationToken);

    public IAsyncEnumerable<DayCloseNotificationWorkItem> ReadAllAsync(CancellationToken cancellationToken)
        => _channel.Reader.ReadAllAsync(cancellationToken);
}
