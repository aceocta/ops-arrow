using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ScratchCard.Application.Common.Services;

namespace ScratchCard.Infrastructure.Services;

/// <summary>
/// Periodically flips ShopSubscription rows whose trial has ended from TrialActive to TrialExpired.
/// Runs on a fixed interval (default 15 minutes) so a shop is gated within minutes of trial end.
/// </summary>
public sealed class ShopTrialExpiryBackgroundService : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromMinutes(15);

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

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var service = scope.ServiceProvider.GetRequiredService<IShopSubscriptionService>();
                await service.ProcessTrialExpiriesAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Shop trial expiry sweep failed.");
            }

            try { await Task.Delay(Interval, stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }
}
