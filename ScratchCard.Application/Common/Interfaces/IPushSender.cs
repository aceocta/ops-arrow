using ScratchCard.Application.Common.Models;

namespace ScratchCard.Application.Common.Interfaces;

public interface IPushSender
{
    Task SendAsync(NotificationMessage message, CancellationToken cancellationToken = default);
}
