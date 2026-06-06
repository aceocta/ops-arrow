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
/// Emails (and WhatsApps) the previous week's timesheet to a shop's managers/owners on Monday
/// morning in the shop's timezone. Gated by the staff_rota.timesheet_export subscription feature;
/// channel/plan gates (notifications.email / .whatsapp) are applied by <see cref="INotificationService"/>.
/// Runs hourly and fires once per shop per week (Monday ~07:00 shop-local; in-memory week guard).
/// </summary>
public sealed class WeeklyTimesheetBackgroundService : BackgroundService
{
    private static readonly TimeSpan SweepInterval = TimeSpan.FromHours(1);
    private const int SendHourLocal = 7; // Monday 07:00 shop-local

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<WeeklyTimesheetBackgroundService> _logger;
    private readonly Dictionary<Guid, DateOnly> _lastSentWeek = new(); // shopId -> week start already sent

    public WeeklyTimesheetBackgroundService(IServiceScopeFactory scopeFactory, ILogger<WeeklyTimesheetBackgroundService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try { await Task.Delay(TimeSpan.FromSeconds(55), stoppingToken); }
        catch (OperationCanceledException) { return; }

        while (!stoppingToken.IsCancellationRequested)
        {
            try { await RunOneSweepAsync(stoppingToken); }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception ex) { _logger.LogError(ex, "Weekly timesheet sweep failed."); }

            try { await Task.Delay(SweepInterval, stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }

    private async Task RunOneSweepAsync(CancellationToken cancellationToken)
    {
        var nowUtc = DateTimeOffset.UtcNow;

        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var notificationService = scope.ServiceProvider.GetRequiredService<INotificationService>();
        var featureGate = scope.ServiceProvider.GetRequiredService<IFeatureGateService>();
        var shopConfig = scope.ServiceProvider.GetRequiredService<IShopConfigurationService>();

        // Only consider shops that have rota attendance at all (cheap pre-filter).
        var shopIds = await dbContext.ShiftAttendances
            .AsNoTracking()
            .Select(x => x.ShopId)
            .Distinct()
            .ToListAsync(cancellationToken);

        foreach (var shopId in shopIds)
        {
            var tz = ResolveTimeZone((await shopConfig.GetShiftSetupAsync(shopId, cancellationToken)).TimeZoneId);
            var shopNow = TimeZoneInfo.ConvertTime(nowUtc, tz);

            if (shopNow.DayOfWeek != DayOfWeek.Monday || shopNow.Hour != SendHourLocal)
            {
                continue;
            }

            var thisMonday = DateOnly.FromDateTime(shopNow.DateTime);
            if (_lastSentWeek.TryGetValue(shopId, out var sent) && sent == thisMonday)
            {
                continue; // already sent this week
            }

            if (!await featureGate.HasFeatureAsync(shopId, FeatureKeys.StaffRotaTimesheetExport, cancellationToken))
            {
                _lastSentWeek[shopId] = thisMonday; // don't re-check every hour today
                continue;
            }

            try
            {
                await SendShopWeeklyTimesheetAsync(dbContext, notificationService, shopId, thisMonday, tz, cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to send weekly timesheet for shop {ShopId}", shopId);
            }

            _lastSentWeek[shopId] = thisMonday;
        }
    }

    private static async Task SendShopWeeklyTimesheetAsync(
        ApplicationDbContext dbContext, INotificationService notificationService,
        Guid shopId, DateOnly thisMonday, TimeZoneInfo tz, CancellationToken cancellationToken)
    {
        var weekStart = thisMonday.AddDays(-7);  // previous Monday
        var weekEnd = thisMonday.AddDays(-1);    // previous Sunday

        // Convert the shop-local week window to UTC bounds for the attendance query.
        var fromBound = new DateTimeOffset(TimeZoneInfo.ConvertTimeToUtc(weekStart.ToDateTime(TimeOnly.MinValue), tz), TimeSpan.Zero);
        var toExclusive = new DateTimeOffset(TimeZoneInfo.ConvertTimeToUtc(thisMonday.ToDateTime(TimeOnly.MinValue), tz), TimeSpan.Zero);

        var rows = await dbContext.ShiftAttendances
            .AsNoTracking()
            .Where(a => a.ShopId == shopId && a.CheckInAt >= fromBound && a.CheckInAt < toExclusive)
            .Select(a => new { a.UserId, a.User.FirstName, a.User.LastName, a.CheckInAt, a.CheckOutAt })
            .ToListAsync(cancellationToken);
        if (rows.Count == 0) return; // nothing worked last week — skip

        var perStaff = rows
            .GroupBy(r => new { r.UserId, Name = $"{r.FirstName} {r.LastName}".Trim() })
            .Select(g => new
            {
                g.Key.Name,
                Hours = g.Where(x => x.CheckOutAt != null).Sum(x => (x.CheckOutAt!.Value - x.CheckInAt).TotalHours),
            })
            .OrderBy(x => x.Name)
            .ToList();

        var totalHours = perStaff.Sum(x => x.Hours);
        var shopName = await dbContext.Shops.AsNoTracking()
            .Where(s => s.Id == shopId).Select(s => s.ShopName).FirstOrDefaultAsync(cancellationToken) ?? "Shop";

        static string Hm(double hours)
        {
            var mins = (int)Math.Round(hours * 60);
            return mins >= 60 ? $"{mins / 60}h {mins % 60}m" : $"{mins}m";
        }

        var period = $"{weekStart:dd MMM} – {weekEnd:dd MMM yyyy}";
        var subject = $"Weekly timesheet — {shopName} ({period})";
        var lines = perStaff.Select(x => $"• {x.Name}: {Hm(x.Hours)}");
        var body = $"Timesheet for {shopName}, {period}:\n\n{string.Join("\n", lines)}\n\nTotal: {Hm(totalHours)}";

        // Managers / owners with contact details.
        var managers = await dbContext.ShopUsers
            .AsNoTracking()
            .Where(su => su.ShopId == shopId && su.IsActive
                && (su.Role.Name == RoleNames.CompanyOwner || su.Role.Name == RoleNames.Manager))
            .Select(su => new { su.User.Email, su.User.PhoneNumber })
            .ToListAsync(cancellationToken);

        foreach (var m in managers)
        {
            if (!string.IsNullOrWhiteSpace(m.Email))
            {
                await notificationService.SendAsync(new NotificationMessage
                {
                    ShopId = shopId,
                    NotificationType = NotificationType.WeeklyTimesheet,
                    Channel = NotificationChannel.Email,
                    Recipient = m.Email,
                    Subject = subject,
                    Body = body,
                    RelatedEntityName = nameof(ShiftAttendance),
                }, cancellationToken);
            }

            if (!string.IsNullOrWhiteSpace(m.PhoneNumber))
            {
                await notificationService.SendAsync(new NotificationMessage
                {
                    ShopId = shopId,
                    NotificationType = NotificationType.WeeklyTimesheet,
                    Channel = NotificationChannel.WhatsApp,
                    Recipient = m.PhoneNumber!,
                    Subject = subject,
                    Body = body,
                    RelatedEntityName = nameof(ShiftAttendance),
                }, cancellationToken);
            }
        }
    }

    private static TimeZoneInfo ResolveTimeZone(string? timeZoneId)
    {
        if (string.IsNullOrWhiteSpace(timeZoneId)) return TimeZoneInfo.Utc;
        var id = timeZoneId.Trim();
        try { return TimeZoneInfo.FindSystemTimeZoneById(id); }
        catch { }
        try { return TimeZoneInfo.FindSystemTimeZoneById(id == "Europe/London" ? "GMT Standard Time" : "Europe/London"); }
        catch { return TimeZoneInfo.Utc; }
    }
}
