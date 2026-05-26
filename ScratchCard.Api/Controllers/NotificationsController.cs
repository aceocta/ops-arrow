using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Api.Authorization;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Notifications;
using ScratchCard.Domain.Constants;

namespace ScratchCard.Api.Controllers;

[Route("api/notifications")]
[Authorize(Roles = $"{RoleNames.OwnerRoles},{RoleNames.Manager}")]
public class NotificationsController : BaseApiController
{
    private readonly INotificationLogService _notificationLogService;

    public NotificationsController(INotificationLogService notificationLogService)
    {
        _notificationLogService = notificationLogService;
    }

    [HttpGet]
    public async Task<IActionResult> GetLogs([FromQuery] Guid shopId, CancellationToken cancellationToken)
    {
        var result = await _notificationLogService.GetLogsAsync(shopId, cancellationToken);
        return Success(result);
    }

    [HttpPost("{id:guid}/retry")]
    public async Task<IActionResult> Retry(Guid id, CancellationToken cancellationToken)
    {
        await _notificationLogService.RetryFailedAsync(id, cancellationToken);
        return Success(new { Retried = true });
    }

    [HttpPost("push/register")]
    [RequireFeature(FeatureKeys.NotificationsPush)]
    public async Task<IActionResult> RegisterPushToken([FromBody] RegisterPushTokenRequest request, CancellationToken cancellationToken)
    {
        await _notificationLogService.RegisterPushTokenAsync(request, cancellationToken);
        return Success(new { Registered = true });
    }

    [HttpPost("push/unregister")]
    public async Task<IActionResult> UnregisterPushToken([FromBody] UnregisterPushTokenRequest request, CancellationToken cancellationToken)
    {
        await _notificationLogService.UnregisterPushTokenAsync(request, cancellationToken);
        return Success(new { Unregistered = true });
    }
}
