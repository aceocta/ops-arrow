using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ScratchCard.Application.Common.Services;

namespace ScratchCard.Infrastructure.Services;

/// <summary>
/// Periodic subscription state sweeps:
/// <list type="bullet">
///   <item>Flip ShopSubscription rows whose trial has ended from TrialActive to TrialExpired.</item>
///   <item>Send the 11-month heads-up email and auto-cancel paused shops past the 1-year cap.</item>
/// </list>
/// Trial sweep runs every 15 minutes so gating kicks in promptly. Pause-cap sweep runs once
/// every 24h — its job is daily-grained anyway and we don't want to spam owner inboxes with
/// retries if a single transient email failure happens.
/// </summary>
public sealed class ShopTrialExpiryBackgroundService : BackgroundService
{
    private static readonly TimeSpan TrialInterval = TimeSpan.FromMinutes(15);
    private static readonly TimeSpan PauseCapInterval = TimeSpan.FromHours(24);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<ShopTrialExpiryBackgroundService> _logger;

    public ShopTrialExpiryBackgroundService(IServiceScopeFactory scopeFactory, ILogger<ShopTrialExpiryBackgroundService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Small delay so the host can finish startup before we touch the DB.
        try { await Task.Delay(TimeSpan.FromSeconds(15), stoppingToken); }
        catch (OperationCanceledException) { return; }

        var lastPauseCapSweep = DateTimeOffset.MinValue;

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var service = scope.ServiceProvider.GetRequiredService<IShopSubscriptionService>();
                await service.ProcessTrialExpiriesAsync(stoppingToken);

                if (DateTimeOffset.UtcNow - lastPauseCapSweep >= PauseCapInterval)
                {
                    await service.ProcessPauseCapAsync(stoppingToken);
                    lastPauseCapSweep = DateTimeOffset.UtcNow;
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Shop subscription sweep failed.");
            }

            try { await Task.Delay(TrialInterval, stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }
}
