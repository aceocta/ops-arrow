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
/// Pushes each assigned staff member a reminder a configurable lead time (default 2h) before their
/// rota shift starts. Runs every 15 minutes; a shift is reminded at most once (ReminderSentOn).
/// The shift's start instant is computed from ShiftDate@StartTime in the shop's timezone. Gated by
/// the staff_rota.shift_reminders subscription feature; the push channel/plan gate is applied by
/// <see cref="INotificationService"/>.
/// </summary>
public sealed class ShiftReminderBackgroundService : BackgroundService
{
    private static readonly TimeSpan SweepInterval = TimeSpan.FromMinutes(15);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<ShiftReminderBackgroundService> _logger;

    public ShiftReminderBackgroundService(IServiceScopeFactory scopeFactory, ILogger<ShiftReminderBackgroundService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try { await Task.Delay(TimeSpan.FromSeconds(50), stoppingToken); }
        catch (OperationCanceledException) { return; }

        while (!stoppingToken.IsCancellationRequested)
        {
            try { await RunOneSweepAsync(stoppingToken); }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception ex) { _logger.LogError(ex, "Shift reminder sweep failed."); }

            try { await Task.Delay(SweepInterval, stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }

    private async Task RunOneSweepAsync(CancellationToken cancellationToken)
    {
        var nowUtc = DateTimeOffset.UtcNow;
        var today = DateOnly.FromDateTime(nowUtc.UtcDateTime);
        var windowFrom = today.AddDays(-1);
        var windowTo = today.AddDays(1);

        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var notificationService = scope.ServiceProvider.GetRequiredService<INotificationService>();
        var featureGate = scope.ServiceProvider.GetRequiredService<IFeatureGateService>();
        var shopConfig = scope.ServiceProvider.GetRequiredService<IShopConfigurationService>();

        // Shops with un-reminded upcoming shifts in the +/- 1 day window.
        var shopIds = await dbContext.RotaShifts
            .AsNoTracking()
            .Where(x => !x.IsDeleted && x.ReminderSentOn == null && x.ShiftDate >= windowFrom && x.ShiftDate <= windowTo)
            .Select(x => x.ShopId)
            .Distinct()
            .ToListAsync(cancellationToken);

        foreach (var shopId in shopIds)
        {
            if (!await featureGate.HasFeatureAsync(shopId, FeatureKeys.StaffRotaShiftReminders, cancellationToken))
            {
                continue;
            }

            var setup = await shopConfig.GetShiftSetupAsync(shopId, cancellationToken);
            var tz = ResolveTimeZone(setup.TimeZoneId);
            var lead = TimeSpan.FromMinutes(setup.ReminderLeadMinutes <= 0 ? 120 : setup.ReminderLeadMinutes);

            var shifts = await dbContext.RotaShifts
                .Where(x => x.ShopId == shopId && !x.IsDeleted && x.ReminderSentOn == null
                    && x.ShiftDate >= windowFrom && x.ShiftDate <= windowTo)
                .Include(x => x.Assignments)
                .ToListAsync(cancellationToken);

            foreach (var shift in shifts)
            {
                var localStart = shift.ShiftDate.ToDateTime(shift.StartTime); // shop-local, Unspecified
                DateTimeOffset startUtc;
                try { startUtc = new DateTimeOffset(TimeZoneInfo.ConvertTimeToUtc(localStart, tz), TimeSpan.Zero); }
                catch { startUtc = new DateTimeOffset(localStart, TimeSpan.Zero); }

                var remindAt = startUtc - lead;
                // Fire once we're inside [remindAt, startUtc): close enough to start, but not after it began.
                if (nowUtc < remindAt || nowUtc >= startUtc)
                {
                    continue;
                }

                var assigneeIds = shift.Assignments.Select(a => a.UserId).Distinct().ToList();
                if (assigneeIds.Count > 0)
                {
                    var tokens = await dbContext.UserPushTokens
                        .AsNoTracking()
                        .Where(t => t.ShopId == shopId && t.IsActive && t.PushToken != "" && assigneeIds.Contains(t.UserId))
                        .Select(t => t.PushToken)
                        .Distinct()
                        .ToListAsync(cancellationToken);

                    var startLabel = shift.StartTime.ToString("HH\\:mm");
                    foreach (var token in tokens)
                    {
                        try
                        {
                            await notificationService.SendAsync(new NotificationMessage
                            {
                                ShopId = shopId,
                                NotificationType = NotificationType.ShiftReminder,
                                Channel = NotificationChannel.InApp,
                                Recipient = token,
                                Subject = "Upcoming shift",
                                Body = $"Your {shift.ShiftName} shift starts at {startLabel}.",
                                RelatedEntityName = nameof(RotaShift),
                                RelatedEntityId = shift.Id,
                            }, cancellationToken);
                        }
                        catch (Exception ex)
                        {
                            _logger.LogWarning(ex, "Failed to send shift reminder push for shop {ShopId}", shopId);
                        }
                    }
                }

                shift.ReminderSentOn = nowUtc; // mark even with no tokens, so we don't re-evaluate each sweep
            }

            await dbContext.SaveChangesAsync(cancellationToken);
        }
    }

    private static TimeZoneInfo ResolveTimeZone(string? timeZoneId)
    {
        if (string.IsNullOrWhiteSpace(timeZoneId)) return TimeZoneInfo.Utc;
        var id = timeZoneId.Trim();
        try { return TimeZoneInfo.FindSystemTimeZoneById(id); }
        catch { }
        // IANA <-> Windows fallback for the common UK case.
        try { return TimeZoneInfo.FindSystemTimeZoneById(id == "Europe/London" ? "GMT Standard Time" : "Europe/London"); }
        catch { return TimeZoneInfo.Utc; }
    }
}
