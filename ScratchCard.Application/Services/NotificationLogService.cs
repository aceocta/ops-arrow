using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Models;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Notifications;
using ScratchCard.Domain.Entities;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.Services;

public class NotificationLogService : INotificationLogService
{
    private readonly IRepository<NotificationLog> _notificationRepository;
    private readonly INotificationService _notificationService;

    public NotificationLogService(
        IRepository<NotificationLog> notificationRepository,
        INotificationService notificationService)
    {
        _notificationRepository = notificationRepository;
        _notificationService = notificationService;
    }

    public async Task<IReadOnlyCollection<NotificationLogDto>> GetLogsAsync(Guid shopId, CancellationToken cancellationToken = default)
    {
        var logs = await _notificationRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId)
            .OrderByDescending(x => x.CreatedOn)
            .ToListAsync(cancellationToken);

        return logs.Select(x => x.ToDto()).ToArray();
    }

    public async Task RetryFailedAsync(Guid notificationLogId, CancellationToken cancellationToken = default)
    {
        var log = await _notificationRepository.GetByIdAsync(notificationLogId, cancellationToken)
            ?? throw new AppException("notification_log_not_found", "Notification log not found.", 404);

        if (log.Status != NotificationStatus.Failed)
        {
            return;
        }

        await _notificationService.SendAsync(new NotificationMessage
        {
            ShopId = log.ShopId,
            NotificationType = log.NotificationType,
            Channel = log.Channel,
            Recipient = log.Recipient,
            Subject = log.Subject,
            Body = log.Message,
            RelatedEntityName = log.RelatedEntityName,
            RelatedEntityId = log.RelatedEntityId
        }, cancellationToken);
    }
}
