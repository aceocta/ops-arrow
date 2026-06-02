using System.Threading.Channels;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Models;

namespace ScratchCard.Infrastructure.Services;

public sealed class DayCloseAttachmentBackgroundQueue : IDayCloseAttachmentDispatcher
{
    private readonly Channel<DayCloseAttachmentWorkItem> _channel;

    public DayCloseAttachmentBackgroundQueue()
    {
        _channel = Channel.CreateBounded<DayCloseAttachmentWorkItem>(new BoundedChannelOptions(512)
        {
            FullMode = BoundedChannelFullMode.Wait,
            SingleReader = true,
            SingleWriter = false
        });
    }

    public ValueTask EnqueueAsync(DayCloseAttachmentWorkItem workItem, CancellationToken cancellationToken = default)
        => _channel.Writer.WriteAsync(workItem, cancellationToken);

    public IAsyncEnumerable<DayCloseAttachmentWorkItem> ReadAllAsync(CancellationToken cancellationToken)
        => _channel.Reader.ReadAllAsync(cancellationToken);
}
