using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Models;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.Services;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Entities;
using ScratchCard.Domain.Enums;
using ScratchCard.Infrastructure.Persistence;

namespace ScratchCard.Infrastructure.Services;

/// <summary>
/// Periodically inspects today's recorded temperature readings against each shop's configured
/// schedule (CfgTemperatureSchedule) and dispatches a single alert per missed slot. Two feature
/// gates apply:
///   - temperature_log.scheduled_checks: shop must have schedules configured. Without the
///     feature, this service won't see any schedules for the shop and so won't fire.
///   - temperature_log.missed_alerts: shop must have alert dispatch enabled. Without the
///     feature, NotificationService.SendAsync gates by channel so the alert is suppressed.
/// We dedupe in-memory by maintaining a (shopId, scheduleId, businessDate) set scoped to one
/// sweep cycle. Persisting dedupe across restarts is intentionally out of scope; the alert is
/// idempotent enough that a duplicate per restart is acceptable.
/// </summary>
public sealed class TemperatureMissedAlertsBackgroundService : BackgroundService
{
    private static readonly TimeSpan SweepInterval = TimeSpan.FromMinutes(15);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<TemperatureMissedAlertsBackgroundService> _logger;

    public TemperatureMissedAlertsBackgroundService(
        IServiceScopeFactory scopeFactory,
        ILogger<TemperatureMissedAlertsBackgroundService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try { await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken); }
        catch (OperationCanceledException) { return; }

        // Per-sweep deduplication only. A schedule that fires once will not re-fire in the same
        // process lifetime; this prevents a burst of duplicate emails when readings remain
        // missed across sweeps.
        var firedThisSession = new HashSet<(Guid scheduleId, DateOnly date)>();

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RunOneSweepAsync(firedThisSession, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Temperature missed-alerts sweep failed.");
            }

            try { await Task.Delay(SweepInterval, stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }

    private async Task RunOneSweepAsync(HashSet<(Guid, DateOnly)> fired, CancellationToken cancellationToken)
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var featureGate = scope.ServiceProvider.GetRequiredService<IFeatureGateService>();
        var notificationService = scope.ServiceProvider.GetRequiredService<INotificationService>();

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var nowUtc = DateTimeOffset.UtcNow;
        var nowTime = TimeOnly.FromDateTime(nowUtc.UtcDateTime);

        // Pull active schedules and their shop IDs. Anything inactive or attached to a deleted
        // shop is skipped. We don't filter by feature here — the per-shop check happens below.
        var schedules = await dbContext.CfgTemperatureSchedules
            .AsNoTracking()
            .Include(s => s.Units)
            .Where(s => s.IsActive && !s.IsRandom)
            .ToListAsync(cancellationToken);

        if (schedules.Count == 0) return;

        // schedule id -> the units it links (empty == all units).
        var linksBySchedule = schedules.ToDictionary(
            s => s.Id,
            s => (ISet<Guid>)s.Units.Select(u => u.TemperatureMonitoringUnitId).ToHashSet());

        var shopIds = schedules.Select(s => s.ShopId).Distinct().ToArray();
        foreach (var shopId in shopIds)
        {
            // missed_alerts is a Growth+ feature; suppress before we do any work for this shop.
            if (!await featureGate.HasFeatureAsync(shopId, FeatureKeys.TemperatureLogMissedAlerts, cancellationToken))
            {
                continue;
            }

            var shopSchedules = schedules.Where(s => s.ShopId == shopId).ToArray();

            // Pull today's readings for the shop in one trip.
            var readings = await dbContext.TemperatureReadings
                .AsNoTracking()
                .Where(r => r.ShopId == shopId && r.ReadingDate == today)
                .Select(r => new { r.TemperatureMonitoringUnitId, r.ReadingTime })
                .ToListAsync(cancellationToken);

            // A slot counts as covered when a reading falls into its time window — the same window
            // assignment the log screen and grid report use — so an early or late reading suppresses
            // the missed alert, not only one inside the tolerance band. Computed per unit because a
            // reading's window depends on the full slot sequence applicable to that unit.
            var coveredScheduleIds = new HashSet<Guid>();
            foreach (var unitReadings in readings.GroupBy(r => r.TemperatureMonitoringUnitId))
            {
                var unitId = unitReadings.Key;
                var unitSpecific = (ISet<Guid>)shopSchedules
                    .Where(s => linksBySchedule[s.Id].Count > 0 && linksBySchedule[s.Id].Contains(unitId))
                    .Select(s => s.Id)
                    .ToHashSet();
                var applicable = TemperatureScheduleWindows.SortByTime(
                    shopSchedules.Where(s => TemperatureScheduleWindows.AppliesToUnit(linksBySchedule[s.Id], unitId)),
                    unitSpecific);
                if (applicable.Count == 0) continue;
                foreach (var reading in unitReadings)
                {
                    var index = TemperatureScheduleWindows.AssignIndex(applicable, reading.ReadingTime);
                    if (index >= 0) coveredScheduleIds.Add(applicable[index].Id);
                }
            }

            // Push-only delivery: every logged-in device for this shop with an active push token.
            // Tokens are registered on login and removed on logout. (Missed alerts used to go out by
            // email; they are now push-only, matching the temperature-log reminder.)
            var pushTokens = await dbContext.UserPushTokens
                .AsNoTracking()
                .Where(t => t.ShopId == shopId && t.IsActive && t.PushToken != "")
                .Select(t => t.PushToken)
                .Distinct()
                .ToListAsync(cancellationToken);
            if (pushTokens.Count == 0) continue;

            foreach (var schedule in shopSchedules)
            {
                if (fired.Contains((schedule.Id, today))) continue;

                // Slot's tolerance window has not yet ended — not overdue, so nothing to alert on.
                var slotEnd = schedule.ExpectedTime.AddMinutes(schedule.ToleranceMinutes);
                if (nowTime < slotEnd) continue;

                // A reading fell into this slot's window (early, on time, or late) — not missed.
                if (coveredScheduleIds.Contains(schedule.Id)) continue;

                fired.Add((schedule.Id, today));

                var subject = $"Missed temperature check: {schedule.Label}";
                var body = $"Scheduled reading '{schedule.Label}' at {schedule.ExpectedTime:HH\\:mm} was not recorded today ({today:yyyy-MM-dd}). Tolerance window {schedule.ToleranceMinutes} min.";

                foreach (var token in pushTokens)
                {
                    try
                    {
                        await notificationService.SendAsync(new NotificationMessage
                        {
                            ShopId = shopId,
                            NotificationType = NotificationType.TemperatureMissedLog,
                            Channel = NotificationChannel.InApp,
                            Recipient = token,
                            Subject = subject,
                            Body = body,
                            RelatedEntityName = nameof(CfgTemperatureSchedule),
                            RelatedEntityId = schedule.Id
                        }, cancellationToken);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Failed to send missed-temperature alert push to a device for shop {ShopId}", shopId);
                    }
                }
            }
        }
    }
}
