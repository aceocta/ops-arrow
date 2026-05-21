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
    private readonly INotificationService _notificationService;
    private readonly ICurrentUserService _currentUserService;
    private readonly IUnitOfWork _unitOfWork;

    public NotificationLogService(
        IRepository<NotificationLog> notificationRepository,
        IRepository<UserPushToken> userPushTokenRepository,
        IRepository<ShopUser> shopUserRepository,
        INotificationService notificationService,
        ICurrentUserService currentUserService,
        IUnitOfWork unitOfWork)
    {
        _notificationRepository = notificationRepository;
        _userPushTokenRepository = userPushTokenRepository;
        _shopUserRepository = shopUserRepository;
        _notificationService = notificationService;
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
}
