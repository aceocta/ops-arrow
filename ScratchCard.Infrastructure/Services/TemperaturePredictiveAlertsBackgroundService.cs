using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Services;
using ScratchCard.Domain.Constants;
using ScratchCard.Infrastructure.Persistence;

namespace ScratchCard.Infrastructure.Services;

/// <summary>
/// Periodic predictive-temperature sweep — warn before a unit breaches, not just after. The trend
/// math and push dispatch live in <see cref="ITemperaturePredictionService"/> (shared with the
/// on-demand "check now" trigger from the apps); this service runs it across shops on a timer and
/// dedupes so a sustained drift alerts once per process session rather than every sweep.
/// </summary>
public sealed class TemperaturePredictiveAlertsBackgroundService : BackgroundService
{
    private static readonly TimeSpan SweepInterval = TimeSpan.FromMinutes(15);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<TemperaturePredictiveAlertsBackgroundService> _logger;

    public TemperaturePredictiveAlertsBackgroundService(
        IServiceScopeFactory scopeFactory,
        ILogger<TemperaturePredictiveAlertsBackgroundService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try { await Task.Delay(TimeSpan.FromSeconds(45), stoppingToken); }
        catch (OperationCanceledException) { return; }

        // One alert per (unit, business date, direction) per process session.
        var fired = new HashSet<(Guid unitId, DateOnly date, string direction)>();

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RunOneSweepAsync(fired, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Temperature predictive-alerts sweep failed.");
            }

            try { await Task.Delay(SweepInterval, stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }

    private async Task RunOneSweepAsync(HashSet<(Guid, DateOnly, string)> fired, CancellationToken cancellationToken)
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var featureGate = scope.ServiceProvider.GetRequiredService<IFeatureGateService>();
        var prediction = scope.ServiceProvider.GetRequiredService<ITemperaturePredictionService>();

        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var shopIds = await dbContext.TemperatureMonitoringUnits
            .AsNoTracking()
            .Where(u => u.IsActive)
            .Select(u => u.ShopId)
            .Distinct()
            .ToListAsync(cancellationToken);

        foreach (var shopId in shopIds)
        {
            // Same "alerts" entitlement as the missed-log alert; skip before doing any work.
            if (!await featureGate.HasFeatureAsync(shopId, FeatureKeys.TemperatureLogMissedAlerts, cancellationToken))
                continue;

            var result = await prediction.EvaluateAsync(shopId, cancellationToken);
            if (result.Predictions.Count == 0) continue;

            // Drop anything already alerted this session so a sustained drift doesn't re-fire.
            var fresh = result.Predictions
                .Where(p => fired.Add((p.UnitId, today, p.Direction)))
                .ToList();
            if (fresh.Count == 0) continue;

            await prediction.DispatchAsync(shopId, fresh, cancellationToken);
        }
    }
}
