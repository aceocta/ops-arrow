using Microsoft.Extensions.Logging;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Models;
using ScratchCard.Domain.Entities;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Infrastructure.Services;

public class NotificationService : INotificationService
{
    private readonly IRepository<NotificationLog> _notificationRepository;
    private readonly IEmailSender _emailSender;
    private readonly ISmsSender _smsSender;
    private readonly IPushSender _pushSender;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ILogger<NotificationService> _logger;

    public NotificationService(
        IRepository<NotificationLog> notificationRepository,
        IEmailSender emailSender,
        ISmsSender smsSender,
        IPushSender pushSender,
        IUnitOfWork unitOfWork,
        ILogger<NotificationService> logger)
    {
        _notificationRepository = notificationRepository;
        _emailSender = emailSender;
        _smsSender = smsSender;
        _pushSender = pushSender;
        _unitOfWork = unitOfWork;
        _logger = logger;
    }

    public async Task SendAsync(NotificationMessage message, CancellationToken cancellationToken = default)
    {
        var log = new NotificationLog
        {
            ShopId = message.ShopId,
            NotificationType = message.NotificationType,
            Channel = message.Channel,
            Recipient = message.Recipient,
            Subject = message.Subject,
            Message = message.Body,
            Status = NotificationStatus.Pending,
            RelatedEntityName = message.RelatedEntityName,
            RelatedEntityId = message.RelatedEntityId,
            CreatedOn = DateTimeOffset.UtcNow
        };

        await _notificationRepository.AddAsync(log, cancellationToken);

        try
        {
            switch (message.Channel)
            {
                case NotificationChannel.Email:
                    await _emailSender.SendAsync(new EmailMessage
                    {
                        Recipient = message.Recipient,
                        Subject = message.Subject,
                        Body = message.Body,
                        IsBodyHtml = message.IsBodyHtml,
                        Attachments = message.Attachments
                    }, cancellationToken);
                    break;
                case NotificationChannel.SMS:
                    await _smsSender.SendAsync(message.Recipient, message.Body, cancellationToken);
                    break;
                case NotificationChannel.InApp:
                    await _pushSender.SendAsync(message, cancellationToken);
                    break;
            }

            log.Status = NotificationStatus.Sent;
            log.SentOn = DateTimeOffset.UtcNow;
        }
        catch (Exception ex)
        {
            log.Status = NotificationStatus.Failed;
            log.FailedReason = ex.Message;
            _logger.LogError(ex, "Notification send failed for recipient {Recipient}", message.Recipient);
            throw;
        }
        finally
        {
            await _unitOfWork.SaveChangesAsync(cancellationToken);
        }
    }
}
