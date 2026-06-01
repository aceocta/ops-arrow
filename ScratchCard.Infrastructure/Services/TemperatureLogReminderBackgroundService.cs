using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Models;
using ScratchCard.Domain.Entities;
using ScratchCard.Domain.Enums;
using ScratchCard.Infrastructure.Persistence;

namespace ScratchCard.Infrastructure.Services;

/// <summary>
/// Hourly reminder that nudges every logged-in user (any role) of a shop, via push only, while a
/// scheduled temperature check is due/overdue and nobody has logged it yet. Unlike
/// <see cref="TemperatureMissedAlertsBackgroundService"/> (one email to managers per missed slot),
/// this re-fires every hour until the reading is recorded and targets each device with an active
/// push token — so "active token" stands in for "currently logged-in person".
///
/// Behaviour (per the product decision):
///   - Trigger: a configured schedule slot's tolerance window has closed today with no reading.
///   - Scope: per shop — if ANY staff member logged the slot's reading, nobody is reminded.
///   - Hours: only fires within a daytime window (07:00–22:00 UTC) so staff aren't pinged overnight.
///
/// Delivery goes through <see cref="INotificationService"/> on the InApp (push) channel, so the
/// platform's notifications.push plan gate and notification logging both apply automatically. The
/// push carries notificationType=TemperatureLogReminder in its data payload; the mobile app routes
/// a tap on it to the Temperature Log screen.
/// </summary>
public sealed class TemperatureLogReminderBackgroundService : BackgroundService
{
    private static readonly TimeSpan SweepInterval = TimeSpan.FromHours(1);

    // Daytime window (UTC). Outside this range the sweep is skipped entirely.
    private static readonly TimeOnly DaytimeStart = new(7, 0);
    private static readonly TimeOnly DaytimeEnd = new(22, 0);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<TemperatureLogReminderBackgroundService> _logger;

    public TemperatureLogReminderBackgroundService(
        IServiceScopeFactory scopeFactory,
        ILogger<TemperatureLogReminderBackgroundService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try { await Task.Delay(TimeSpan.FromSeconds(45), stoppingToken); }
        catch (OperationCanceledException) { return; }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RunOneSweepAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Temperature log reminder sweep failed.");
            }

            try { await Task.Delay(SweepInterval, stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }

    private async Task RunOneSweepAsync(CancellationToken cancellationToken)
    {
        var nowUtc = DateTimeOffset.UtcNow;
        var nowTime = TimeOnly.FromDateTime(nowUtc.UtcDateTime);

        // Daytime-only: silent overnight.
        if (nowTime < DaytimeStart || nowTime > DaytimeEnd)
        {
            return;
        }

        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var notificationService = scope.ServiceProvider.GetRequiredService<INotificationService>();

        var today = DateOnly.FromDateTime(nowUtc.UtcDateTime);

        var schedules = await dbContext.CfgTemperatureSchedules
            .AsNoTracking()
            .Where(s => s.IsActive)
            .ToListAsync(cancellationToken);
        if (schedules.Count == 0) return;

        var shopIds = schedules.Select(s => s.ShopId).Distinct().ToArray();
        foreach (var shopId in shopIds)
        {
            var shopSchedules = schedules.Where(s => s.ShopId == shopId).ToArray();

            // Today's readings for the shop, in one trip. Per-shop scope: a reading by ANY user
            // satisfies the slot.
            var readings = await dbContext.TemperatureReadings
                .AsNoTracking()
                .Where(r => r.ShopId == shopId && r.ReadingDate == today)
                .Select(r => new { r.TemperatureMonitoringUnitId, r.ReadingTime })
                .ToListAsync(cancellationToken);

            // Count schedule slots that are overdue (window closed) and still unfilled.
            var pendingSlots = 0;
            foreach (var schedule in shopSchedules)
            {
                var slotEnd = schedule.ExpectedTime.AddMinutes(schedule.ToleranceMinutes);
                if (nowTime < slotEnd) continue; // window not closed yet — not overdue.

                var slotStart = schedule.ExpectedTime.AddMinutes(-schedule.ToleranceMinutes);
                var hit = readings.Any(r =>
                    (schedule.TemperatureMonitoringUnitId == null || r.TemperatureMonitoringUnitId == schedule.TemperatureMonitoringUnitId) &&
                    r.ReadingTime >= slotStart && r.ReadingTime <= slotEnd);
                if (!hit) pendingSlots++;
            }

            if (pendingSlots == 0) continue;

            // Logged-in users of this shop, regardless of role: every device with an active push
            // token. Tokens are registered on login and removed on logout.
            var pushTokens = await dbContext.UserPushTokens
                .AsNoTracking()
                .Where(t => t.ShopId == shopId && t.IsActive && t.PushToken != "")
                .Select(t => t.PushToken)
                .Distinct()
                .ToListAsync(cancellationToken);
            if (pushTokens.Count == 0) continue;

            var subject = "Temperature check pending";
            var body = pendingSlots == 1
                ? "A temperature reading is due today. Tap to log it."
                : $"{pendingSlots} temperature readings are due today. Tap to log them.";

            foreach (var token in pushTokens)
            {
                try
                {
                    await notificationService.SendAsync(new NotificationMessage
                    {
                        ShopId = shopId,
                        NotificationType = NotificationType.TemperatureLogReminder,
                        Channel = NotificationChannel.InApp,
                        Recipient = token,
                        Subject = subject,
                        Body = body,
                        RelatedEntityName = nameof(CfgTemperatureSchedule)
                    }, cancellationToken);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to send temperature log reminder push to a device for shop {ShopId}", shopId);
                }
            }
        }
    }
}
