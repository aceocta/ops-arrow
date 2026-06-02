using System.Threading.Channels;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Models;

namespace ScratchCard.Infrastructure.Services;

public sealed class ShiftCloseAttachmentBackgroundQueue : IShiftCloseAttachmentDispatcher
{
    private readonly Channel<ShiftCloseAttachmentWorkItem> _channel;

    public ShiftCloseAttachmentBackgroundQueue()
    {
        _channel = Channel.CreateBounded<ShiftCloseAttachmentWorkItem>(new BoundedChannelOptions(512)
        {
            FullMode = BoundedChannelFullMode.Wait,
            SingleReader = true,
            SingleWriter = false
        });
    }

    public ValueTask EnqueueAsync(ShiftCloseAttachmentWorkItem workItem, CancellationToken cancellationToken = default)
        => _channel.Writer.WriteAsync(workItem, cancellationToken);

    public IAsyncEnumerable<ShiftCloseAttachmentWorkItem> ReadAllAsync(CancellationToken cancellationToken)
        => _channel.Reader.ReadAllAsync(cancellationToken);
}
