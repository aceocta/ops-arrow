using ScratchCard.Application.Common.Models;

namespace ScratchCard.Application.Common.Interfaces;

public interface IShiftCloseAttachmentDispatcher
{
    ValueTask EnqueueAsync(ShiftCloseAttachmentWorkItem workItem, CancellationToken cancellationToken = default);
}
