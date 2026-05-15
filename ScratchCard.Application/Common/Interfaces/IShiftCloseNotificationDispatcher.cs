using ScratchCard.Application.Common.Models;

namespace ScratchCard.Application.Common.Interfaces;

public interface IShiftCloseNotificationDispatcher
{
    ValueTask EnqueueAsync(ShiftCloseNotificationWorkItem workItem, CancellationToken cancellationToken = default);
}
