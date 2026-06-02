using ScratchCard.Application.Common.Models;

namespace ScratchCard.Application.Common.Interfaces;

public interface IDayCloseAttachmentDispatcher
{
    ValueTask EnqueueAsync(DayCloseAttachmentWorkItem workItem, CancellationToken cancellationToken = default);
}
