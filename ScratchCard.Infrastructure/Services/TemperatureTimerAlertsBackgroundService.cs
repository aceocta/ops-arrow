using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Models;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Entities;
using ScratchCard.Domain.Enums;
using ScratchCard.Infrastructure.Persistence;

namespace ScratchCard.Infrastructure.Services;

/// <summary>
/// Watches open equipment issues (Not Working / Under Maintenance) and fires the spec §16/§18 food-safety
/// dwell-timer alerts as each issue's 2-hour (hot) / 4-hour (cold) limit approaches, is reached, or is left
/// unresolved well past it. Elapsed time is computed from <c>IssueStartedOn</c> — timers are stored as an
/// anchor, not ticking. In-app push goes to every logged-in device for the shop; the limit and escalation
/// stages also email owners &amp; managers. Frozen units have no §16 dwell rule and are skipped.
///
/// Dedupe is in-memory per (issueId, stage) for the process lifetime — a restart may re-alert a stage once,
/// which is acceptable for a safety reminder. Channel/plan gating is handled inside
/// <see cref="INotificationService.SendAsync"/>.
/// </summary>
public sealed class TemperatureTimerAlertsBackgroundService : BackgroundService
{
    private static readonly TimeSpan SweepInterval = TimeSpan.FromMinutes(10);
    private static readonly TimeSpan NearLimitWindow = TimeSpan.FromMinutes(30);
    private static readonly TimeSpan HotLimit = TimeSpan.FromHours(2);
    private static readonly TimeSpan ColdLimit = TimeSpan.FromHours(4);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<TemperatureTimerAlertsBackgroundService> _logger;

    public TemperatureTimerAlertsBackgroundService(
        IServiceScopeFactory scopeFactory,
        ILogger<TemperatureTimerAlertsBackgroundService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try { await Task.Delay(TimeSpan.FromSeconds(45), stoppingToken); }
        catch (OperationCanceledException) { return; }

        // Per-process dedupe: each (issue, stage) fires at most once per lifetime.
        var fired = new HashSet<(Guid issueId, string stage)>();

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RunOneSweepAsync(fired, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Temperature timer-alerts sweep failed.");
            }

            try { await Task.Delay(SweepInterval, stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }

    private async Task RunOneSweepAsync(HashSet<(Guid, string)> fired, CancellationToken cancellationToken)
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var notificationService = scope.ServiceProvider.GetRequiredService<INotificationService>();

        var nowUtc = DateTimeOffset.UtcNow;

        var openIssues = await dbContext.TemperatureEquipmentIssues
            .AsNoTracking()
            .Include(i => i.TemperatureMonitoringUnit)
            .Where(i => i.Status == EquipmentWorkingStatus.NotWorking || i.Status == EquipmentWorkingStatus.UnderMaintenance)
            .ToListAsync(cancellationToken);

        if (openIssues.Count == 0) return;

        foreach (var issue in openIssues)
        {
            var category = issue.TemperatureMonitoringUnit?.FoodCategory ?? FoodCategory.ColdFood;
            // §16 covers hot (2h) and chilled (4h); frozen has no dwell rule.
            if (category == FoodCategory.Frozen) continue;
            var limit = category == FoodCategory.HotFood ? HotLimit : ColdLimit;

            var elapsed = nowUtc - issue.IssueStartedOn;

            string stage;
            NotificationType type;
            bool isPriority;
            if (elapsed >= limit * 2) { stage = "escalation"; type = NotificationType.TemperatureIssueEscalated; isPriority = true; }
            else if (elapsed >= limit) { stage = "limit"; type = NotificationType.TemperatureTimerLimitReached; isPriority = true; }
            else if (elapsed >= limit - NearLimitWindow) { stage = "near"; type = NotificationType.TemperatureTimerNearLimit; isPriority = false; }
            else { continue; }

            if (!fired.Add((issue.Id, stage))) continue;

            var unitName = issue.TemperatureMonitoringUnit?.UnitName ?? "Unit";
            var limitHours = (int)limit.TotalHours;
            var elapsedMinutes = (int)Math.Round(elapsed.TotalMinutes);
            var subject = stage switch
            {
                "escalation" => $"ESCALATION: {unitName} unresolved too long",
                "limit" => $"CRITICAL: {unitName} past the {limitHours}h food-safety limit",
                _ => $"{unitName} approaching the {limitHours}h food-safety limit"
            };
            var body = $"{unitName} has been outside the safe range for about {elapsedMinutes} min (limit {limitHours}h). "
                + (stage == "near"
                    ? "Act before the time-control limit is reached."
                    : "The food-safety time limit has been exceeded — take action now.");

            // Push to every logged-in device for the shop.
            var pushTokens = await dbContext.UserPushTokens
                .AsNoTracking()
                .Where(t => t.ShopId == issue.ShopId && t.IsActive && t.PushToken != "")
                .Select(t => t.PushToken)
                .Distinct()
                .ToListAsync(cancellationToken);

            foreach (var token in pushTokens)
            {
                await SafeSendAsync(notificationService, new NotificationMessage
                {
                    ShopId = issue.ShopId,
                    NotificationType = type,
                    Channel = NotificationChannel.InApp,
                    Recipient = token,
                    Subject = subject,
                    Body = body,
                    RelatedEntityName = nameof(TemperatureEquipmentIssue),
                    RelatedEntityId = issue.Id
                }, issue.ShopId, cancellationToken);
            }

            // The limit and escalation stages also email owners & managers.
            if (stage != "near")
            {
                var emails = await dbContext.ShopUsers
                    .AsNoTracking()
                    .Where(x => x.ShopId == issue.ShopId && x.IsActive
                        && (x.Role.Name == RoleNames.CompanyOwner || x.Role.Name == RoleNames.Manager)
                        && !string.IsNullOrWhiteSpace(x.User.Email))
                    .Select(x => x.User.Email!)
                    .Distinct()
                    .ToListAsync(cancellationToken);

                foreach (var email in emails)
                {
                    await SafeSendAsync(notificationService, new NotificationMessage
                    {
                        ShopId = issue.ShopId,
                        NotificationType = type,
                        Channel = NotificationChannel.Email,
                        Recipient = email,
                        Subject = subject,
                        Body = body,
                        IsBodyHtml = false,
                        IsPriority = isPriority,
                        RelatedEntityName = nameof(TemperatureEquipmentIssue),
                        RelatedEntityId = issue.Id
                    }, issue.ShopId, cancellationToken);
                }
            }
        }
    }

    private async Task SafeSendAsync(INotificationService notificationService, NotificationMessage message, Guid shopId, CancellationToken cancellationToken)
    {
        try
        {
            await notificationService.SendAsync(message, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to send a temperature timer alert for shop {ShopId}", shopId);
        }
    }
}
