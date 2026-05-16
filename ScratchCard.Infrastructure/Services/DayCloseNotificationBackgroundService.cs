using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ScratchCard.Application.Common.Services;

namespace ScratchCard.Infrastructure.Services;

public sealed class DayCloseNotificationBackgroundService : BackgroundService
{
    private readonly DayCloseNotificationBackgroundQueue _queue;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<DayCloseNotificationBackgroundService> _logger;

    public DayCloseNotificationBackgroundService(
        DayCloseNotificationBackgroundQueue queue,
        IServiceScopeFactory scopeFactory,
        ILogger<DayCloseNotificationBackgroundService> logger)
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
                var businessDayService = scope.ServiceProvider.GetRequiredService<IBusinessDayService>();
                await businessDayService.SendDayCloseNotificationsAsync(workItem.BusinessDayId, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(
                    ex,
                    "Background day close notification dispatch failed for business day {BusinessDayId}",
                    workItem.BusinessDayId);
            }
        }
    }
}
