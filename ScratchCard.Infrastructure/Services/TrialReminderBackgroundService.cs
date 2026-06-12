using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ScratchCard.Application.Common.Services;

namespace ScratchCard.Infrastructure.Services;

/// <summary>
/// Trial-ending reminder sweep: emails a shop's company owner(s) when a TrialActive
/// subscription's TrialEndsOn falls within 7, 3 or 1 day(s). The sweep runs every 6 hours but
/// each threshold fires at most once per trial — ShopSubscription.TrialReminderStage records
/// the last threshold already emailed, so re-runs and restarts never duplicate a send.
/// Structure mirrors <see cref="ShopTrialExpiryBackgroundService"/> /
/// <see cref="WeeklyTimesheetBackgroundService"/>.
/// </summary>
public sealed class TrialReminderBackgroundService : BackgroundService
{
    private static readonly TimeSpan SweepInterval = TimeSpan.FromHours(6);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<TrialReminderBackgroundService> _logger;

    public TrialReminderBackgroundService(IServiceScopeFactory scopeFactory, ILogger<TrialReminderBackgroundService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Small delay so the host can finish startup before we touch the DB.
        try { await Task.Delay(TimeSpan.FromSeconds(25), stoppingToken); }
        catch (OperationCanceledException) { return; }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var service = scope.ServiceProvider.GetRequiredService<IShopSubscriptionService>();
                await service.ProcessTrialRemindersAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Trial reminder sweep failed.");
            }

            try { await Task.Delay(SweepInterval, stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }
}
