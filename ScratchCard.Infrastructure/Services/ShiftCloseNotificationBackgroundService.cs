using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ScratchCard.Application.Common.Services;

namespace ScratchCard.Infrastructure.Services;

public sealed class ShiftCloseNotificationBackgroundService : BackgroundService
{
    private readonly ShiftCloseNotificationBackgroundQueue _queue;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<ShiftCloseNotificationBackgroundService> _logger;

    public ShiftCloseNotificationBackgroundService(
        ShiftCloseNotificationBackgroundQueue queue,
        IServiceScopeFactory scopeFactory,
        ILogger<ShiftCloseNotificationBackgroundService> logger)
    {
        _queue = queue;
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var workItem in _queue.ReadAllAsync(stoppingToken))
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var shiftSalesService = scope.ServiceProvider.GetRequiredService<IShiftSalesService>();
                await shiftSalesService.SendShiftCloseNotificationsAsync(
                    workItem.ShiftId,
                    workItem.IncludeManualEntryNotifications,
                    stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(
                    ex,
                    "Background shift close notification dispatch failed for shift {ShiftId}",
                    workItem.ShiftId);
            }
        }
    }
}
