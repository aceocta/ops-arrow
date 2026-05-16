using ScratchCard.Application.Common.Models;

namespace ScratchCard.Application.Common.Interfaces;

public interface IDayCloseNotificationDispatcher
{
    ValueTask EnqueueAsync(DayCloseNotificationWorkItem workItem, CancellationToken cancellationToken = default);
}
