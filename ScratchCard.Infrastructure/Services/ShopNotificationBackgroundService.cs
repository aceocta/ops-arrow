using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ScratchCard.Application.Common.Services;

namespace ScratchCard.Infrastructure.Services;

public sealed class ShopNotificationBackgroundService : BackgroundService
{
    private readonly ShopNotificationBackgroundQueue _queue;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<ShopNotificationBackgroundService> _logger;

    public ShopNotificationBackgroundService(
        ShopNotificationBackgroundQueue queue,
        IServiceScopeFactory scopeFactory,
        ILogger<ShopNotificationBackgroundService> logger)
    {
        _queue = queue;
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var job in _queue.ReadAllAsync(stoppingToken))
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var worker = scope.ServiceProvider.GetRequiredService<IShopNotificationWorker>();
                await worker.ProcessAsync(job, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Shop notification dispatch failed for shop {ShopId} ({Kind}).", job.ShopId, job.Kind);
            }
        }
    }
}
