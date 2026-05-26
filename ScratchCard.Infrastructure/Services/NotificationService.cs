using Microsoft.Extensions.Logging;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Models;
using ScratchCard.Application.Services;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Entities;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Infrastructure.Services;

public class NotificationService : INotificationService
{
    private readonly IRepository<NotificationLog> _notificationRepository;
    private readonly IEmailSender _emailSender;
    private readonly ISmsSender _smsSender;
    private readonly IPushSender _pushSender;
    private readonly IFeatureGateService _featureGateService;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ILogger<NotificationService> _logger;

    public NotificationService(
        IRepository<NotificationLog> notificationRepository,
        IEmailSender emailSender,
        ISmsSender smsSender,
        IPushSender pushSender,
        IFeatureGateService featureGateService,
        IUnitOfWork unitOfWork,
        ILogger<NotificationService> logger)
    {
        _notificationRepository = notificationRepository;
        _emailSender = emailSender;
        _smsSender = smsSender;
        _pushSender = pushSender;
        _featureGateService = featureGateService;
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

        // Channel-level subscription gate. We persist the log row so the shop can see in the
        // notification history that a message was suppressed (and why), but we never call the
        // underlying sender. The shop-wide subscription middleware handles "no subscription";
        // here we only handle "subscribed plan does not include this channel".
        if (message.ShopId != Guid.Empty && TryGetChannelFeatureKey(message.Channel) is string featureKey)
        {
            if (!await _featureGateService.HasFeatureAsync(message.ShopId, featureKey, cancellationToken))
            {
                log.Status = NotificationStatus.Failed;
                log.FailedReason = $"Channel '{message.Channel}' is not included in the shop's subscription plan ({featureKey}).";
                await _unitOfWork.SaveChangesAsync(cancellationToken);
                _logger.LogInformation(
                    "Suppressed notification: shop {ShopId} plan missing feature {FeatureKey} for channel {Channel}",
                    message.ShopId, featureKey, message.Channel);
                return;
            }
        }

        // Priority demotion. Plans without notifications.priority can flag a message as
        // priority but the dispatcher silently downgrades it. This keeps callers from having to
        // know what tier the shop is on; they always pass the semantically-correct priority.
        if (message.IsPriority && message.ShopId != Guid.Empty)
        {
            if (!await _featureGateService.HasFeatureAsync(message.ShopId, FeatureKeys.NotificationsPriority, cancellationToken))
            {
                message.IsPriority = false;
            }
        }

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
                        Attachments = message.Attachments,
                        IsPriority = message.IsPriority
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

    private static string? TryGetChannelFeatureKey(NotificationChannel channel) => channel switch
    {
        NotificationChannel.Email => FeatureKeys.NotificationsEmail,
        NotificationChannel.InApp => FeatureKeys.NotificationsPush,
        // SMS today maps to the WhatsApp/SMS bucket on plans. When a dedicated WhatsApp sender
        // is added, split this into two cases.
        NotificationChannel.SMS => FeatureKeys.NotificationsWhatsApp,
        _ => null
    };
}
