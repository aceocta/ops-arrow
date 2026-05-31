using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Models;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Notifications;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Entities;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.Services;

public class NotificationLogService : INotificationLogService
{
    private readonly IRepository<NotificationLog> _notificationRepository;
    private readonly IRepository<UserPushToken> _userPushTokenRepository;
    private readonly IRepository<ShopUser> _shopUserRepository;
    private readonly IRepository<User> _userRepository;
    private readonly INotificationService _notificationService;
    private readonly IPushSender _pushSender;
    private readonly ICurrentUserService _currentUserService;
    private readonly IUnitOfWork _unitOfWork;

    public NotificationLogService(
        IRepository<NotificationLog> notificationRepository,
        IRepository<UserPushToken> userPushTokenRepository,
        IRepository<ShopUser> shopUserRepository,
        IRepository<User> userRepository,
        INotificationService notificationService,
        IPushSender pushSender,
        ICurrentUserService currentUserService,
        IUnitOfWork unitOfWork)
    {
        _notificationRepository = notificationRepository;
        _userPushTokenRepository = userPushTokenRepository;
        _shopUserRepository = shopUserRepository;
        _userRepository = userRepository;
        _notificationService = notificationService;
        _pushSender = pushSender;
        _currentUserService = currentUserService;
        _unitOfWork = unitOfWork;
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

    public async Task RegisterPushTokenAsync(RegisterPushTokenRequest request, CancellationToken cancellationToken = default)
    {
        var currentUserId = _currentUserService.UserId
            ?? throw new AppException("unauthorized", "Unauthorized.", 401);

        var hasShopAccess = await _shopUserRepository.Query()
            .AsNoTracking()
            .AnyAsync(
                x =>
                    x.ShopId == request.ShopId &&
                    x.UserId == currentUserId &&
                    x.IsActive,
                cancellationToken);
        if (!hasShopAccess && !_currentUserService.IsInRole(RoleNames.PlatformAdmin))
        {
            throw new AppException("forbidden", "You do not have access to this shop.", 403);
        }

        var normalizedToken = request.PushToken.Trim();
        var normalizedPlatform = request.Platform.Trim();
        var normalizedDeviceName = string.IsNullOrWhiteSpace(request.DeviceName) ? null : request.DeviceName.Trim();
        var now = DateTimeOffset.UtcNow;

        var recordsWithSameToken = await _userPushTokenRepository.Query()
            .Where(
                x =>
                    x.ShopId == request.ShopId &&
                    x.PushToken == normalizedToken)
            .ToListAsync(cancellationToken);

        foreach (var record in recordsWithSameToken.Where(x => x.UserId != currentUserId || !x.IsActive))
        {
            record.IsActive = record.UserId == currentUserId;
            record.ModifiedOn = now;
            record.ModifiedBy = currentUserId;
            _userPushTokenRepository.Update(record);
        }

        var currentUserToken = recordsWithSameToken.FirstOrDefault(x => x.UserId == currentUserId);
        if (currentUserToken is null)
        {
            await _userPushTokenRepository.AddAsync(
                new UserPushToken
                {
                    ShopId = request.ShopId,
                    UserId = currentUserId,
                    PushToken = normalizedToken,
                    Platform = normalizedPlatform,
                    DeviceName = normalizedDeviceName,
                    IsActive = true,
                    RegisteredOn = now,
                    CreatedOn = now,
                    CreatedBy = currentUserId
                },
                cancellationToken);
        }
        else
        {
            currentUserToken.Platform = normalizedPlatform;
            currentUserToken.DeviceName = normalizedDeviceName;
            currentUserToken.IsActive = true;
            currentUserToken.RegisteredOn = now;
            currentUserToken.ModifiedOn = now;
            currentUserToken.ModifiedBy = currentUserId;
            _userPushTokenRepository.Update(currentUserToken);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);
    }

    public async Task UnregisterPushTokenAsync(UnregisterPushTokenRequest request, CancellationToken cancellationToken = default)
    {
        var currentUserId = _currentUserService.UserId
            ?? throw new AppException("unauthorized", "Unauthorized.", 401);

        var normalizedToken = request.PushToken.Trim();
        var records = await _userPushTokenRepository.Query()
            .Where(
                x =>
                    x.ShopId == request.ShopId &&
                    x.UserId == currentUserId &&
                    x.PushToken == normalizedToken &&
                    x.IsActive)
            .ToListAsync(cancellationToken);
        if (records.Count == 0)
        {
            return;
        }

        var now = DateTimeOffset.UtcNow;
        foreach (var record in records)
        {
            record.IsActive = false;
            record.ModifiedOn = now;
            record.ModifiedBy = currentUserId;
            _userPushTokenRepository.Update(record);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);
    }

    public async Task<TestPushResultDto> SendTestPushAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var user = await _userRepository.Query()
            .AsNoTracking()
            .Where(x => x.Id == userId)
            .Select(x => new { x.Id, x.Email })
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new AppException("user_not_found", "User not found.", 404);

        var tokens = await _userPushTokenRepository.Query()
            .AsNoTracking()
            .Where(x => x.UserId == userId && x.IsActive)
            .OrderByDescending(x => x.ModifiedOn ?? x.CreatedOn)
            .ToListAsync(cancellationToken);

        var perToken = new List<TestPushTokenResult>(tokens.Count);
        var subject = "Ops Arrow push test";
        var body = $"Diagnostic ping at {DateTimeOffset.UtcNow:yyyy-MM-dd HH:mm:ss} UTC. If this notification reached your device, the push pipeline is healthy end-to-end.";

        foreach (var t in tokens)
        {
            var message = new NotificationMessage
            {
                ShopId = t.ShopId,
                // Reuse the closest fitting enum value for the diagnostic — there's no dedicated
                // "system test" type and adding one would force a schema/migration change just for
                // a developer tool.
                NotificationType = NotificationType.ShiftCloseSummary,
                Channel = NotificationChannel.InApp,
                Recipient = t.PushToken,
                Subject = subject,
                Body = body,
                IsBodyHtml = false,
                RelatedEntityName = nameof(UserPushToken),
                RelatedEntityId = t.Id,
            };

            // Bypass NotificationService.SendAsync (which applies plan gating + persists a
            // NotificationLog row) — for a diagnostic we want raw per-token success/failure
            // with the Firebase error verbatim, regardless of the shop's plan tier.
            bool sent;
            string? failureReason;
            try
            {
                await _pushSender.SendAsync(message, cancellationToken);
                sent = true;
                failureReason = null;
            }
            catch (Exception ex)
            {
                sent = false;
                failureReason = ex.Message;
            }

            perToken.Add(new TestPushTokenResult
            {
                TokenId = t.Id,
                Platform = t.Platform,
                DeviceName = t.DeviceName,
                // Surface only a head + tail so the response is human-readable but the full
                // token is never echoed back (avoids accidental leakage in logs / screenshots).
                TokenPreview = PreviewToken(t.PushToken),
                Sent = sent,
                FailureReason = failureReason,
                CreatedOn = t.CreatedOn,
                LastUsedOn = t.ModifiedOn,
            });
        }

        return new TestPushResultDto
        {
            UserId = user.Id,
            UserEmail = user.Email,
            TokensRegistered = perToken.Count,
            SentSuccessfully = perToken.Count(x => x.Sent),
            FailedCount = perToken.Count(x => !x.Sent),
            PerToken = perToken,
        };
    }

    private static string PreviewToken(string token)
    {
        if (string.IsNullOrWhiteSpace(token)) return string.Empty;
        var trimmed = token.Trim();
        if (trimmed.Length <= 16) return trimmed;
        return $"{trimmed[..8]}…{trimmed[^6..]}";
    }
}
