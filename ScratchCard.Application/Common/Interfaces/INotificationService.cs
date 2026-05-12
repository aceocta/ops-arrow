namespace ScratchCard.Application.Common.Interfaces;

public interface INotificationService
{
    Task SendAsync(Common.Models.NotificationMessage message, CancellationToken cancellationToken = default);
}
