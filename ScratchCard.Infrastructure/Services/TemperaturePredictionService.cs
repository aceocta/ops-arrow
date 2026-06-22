using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Models;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.TemperatureLogs;
using ScratchCard.Application.Services;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Entities;
using ScratchCard.Domain.Enums;
using ScratchCard.Infrastructure.Persistence;

namespace ScratchCard.Infrastructure.Services;

/// <summary>
/// Shared early-warning temperature analysis. Fits an ordinary-least-squares trend line to a unit's
/// recent in-range readings and flags units projected to cross their min/max within the look-ahead
/// horizon. Used by the periodic sweep and the on-demand "check now" trigger.
/// </summary>
public sealed class TemperaturePredictionService : ITemperaturePredictionService
{
    // Only warn when a crossing is projected within this many minutes — far enough to act, near
    // enough to be real.
    public const double HorizonMinutes = 45;
    // Trend is fitted over readings from the last few hours so it reflects "now", not the whole day.
    private const double LookbackMinutes = 240;
    // Require a sustained drift so flat-line measurement noise doesn't trigger false alarms.
    private const double MinSlopeCelsiusPerMinute = 0.03; // ~1.8°C/hr
    private const double MinSpanMinutes = 20;
    private const int MinReadings = 3;

    private readonly ApplicationDbContext _dbContext;
    private readonly IFeatureGateService _featureGate;
    private readonly INotificationService _notificationService;

    public TemperaturePredictionService(
        ApplicationDbContext dbContext,
        IFeatureGateService featureGate,
        INotificationService notificationService)
    {
        _dbContext = dbContext;
        _featureGate = featureGate;
        _notificationService = notificationService;
    }

    public async Task<TemperaturePredictiveCheckResult> EvaluateAsync(Guid shopId, CancellationToken cancellationToken = default)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var nowTime = TimeOnly.FromDateTime(DateTime.UtcNow);

        var units = await _dbContext.TemperatureMonitoringUnits
            .AsNoTracking()
            .Where(u => u.ShopId == shopId && u.IsActive)
            .Select(u => new { u.Id, u.UnitName, u.MinTemperatureCelsius, u.MaxTemperatureCelsius })
            .ToListAsync(cancellationToken);
        if (units.Count == 0) return new TemperaturePredictiveCheckResult(0, []);

        var readings = await _dbContext.TemperatureReadings
            .AsNoTracking()
            .Where(r => r.ShopId == shopId && r.ReadingDate == today)
            .Select(r => new { r.TemperatureMonitoringUnitId, r.ReadingTime, r.TemperatureCelsius })
            .ToListAsync(cancellationToken);

        var predictions = new List<TemperaturePredictionDto>();

        foreach (var unit in units)
        {
            // Recent readings only (within the lookback), oldest→newest. Same-day comparison avoids
            // any TimeOnly midnight-wrap pitfalls.
            var series = readings
                .Where(r => r.TemperatureMonitoringUnitId == unit.Id)
                .Where(r =>
                {
                    var ageMinutes = (nowTime.ToTimeSpan() - r.ReadingTime.ToTimeSpan()).TotalMinutes;
                    return ageMinutes >= 0 && ageMinutes <= LookbackMinutes;
                })
                .OrderBy(r => r.ReadingTime)
                .ToList();
            if (series.Count < MinReadings) continue;

            var startMinutes = series[0].ReadingTime.ToTimeSpan().TotalMinutes;
            var points = series
                .Select(r => (X: r.ReadingTime.ToTimeSpan().TotalMinutes - startMinutes, Y: (double)r.TemperatureCelsius))
                .ToList();

            if (points[^1].X - points[0].X < MinSpanMinutes) continue;
            if (!TryLinearSlope(points, out var slope)) continue;
            if (Math.Abs(slope) < MinSlopeCelsiusPerMinute) continue;

            var latestTemp = points[^1].Y;
            var max = (double)unit.MaxTemperatureCelsius;
            var min = (double)unit.MinTemperatureCelsius;

            if (slope > 0 && latestTemp < max)
            {
                var minutesToBreach = (max - latestTemp) / slope;
                if (minutesToBreach > 0 && minutesToBreach <= HorizonMinutes)
                {
                    predictions.Add(BuildPrediction(unit.Id, unit.UnitName, latestTemp, slope, max, minutesToBreach, rising: true));
                }
            }
            else if (slope < 0 && latestTemp > min)
            {
                var minutesToBreach = (min - latestTemp) / slope;
                if (minutesToBreach > 0 && minutesToBreach <= HorizonMinutes)
                {
                    predictions.Add(BuildPrediction(unit.Id, unit.UnitName, latestTemp, slope, min, minutesToBreach, rising: false));
                }
            }
        }

        return new TemperaturePredictiveCheckResult(units.Count, predictions);
    }

    public async Task DispatchAsync(Guid shopId, IReadOnlyList<TemperaturePredictionDto> predictions, CancellationToken cancellationToken = default)
    {
        if (predictions.Count == 0) return;

        // Same "alerts" entitlement as the missed-log alert; suppress sending when not entitled.
        if (!await _featureGate.HasFeatureAsync(shopId, FeatureKeys.TemperatureLogMissedAlerts, cancellationToken))
            return;

        var pushTokens = await _dbContext.UserPushTokens
            .AsNoTracking()
            .Where(t => t.ShopId == shopId && t.IsActive && t.PushToken != "")
            .Select(t => t.PushToken)
            .Distinct()
            .ToListAsync(cancellationToken);
        if (pushTokens.Count == 0) return;

        foreach (var prediction in predictions)
        {
            var subject = prediction.Direction == "Rising"
                ? $"Temperature rising: {prediction.UnitName}"
                : $"Temperature falling: {prediction.UnitName}";

            foreach (var token in pushTokens)
            {
                await _notificationService.SendAsync(new NotificationMessage
                {
                    ShopId = shopId,
                    NotificationType = NotificationType.TemperaturePredictiveAlert,
                    Channel = NotificationChannel.InApp,
                    Recipient = token,
                    Subject = subject,
                    Body = prediction.Message,
                    RelatedEntityName = nameof(TemperatureMonitoringUnit),
                    RelatedEntityId = prediction.UnitId
                }, cancellationToken);
            }
        }
    }

    private static TemperaturePredictionDto BuildPrediction(
        Guid unitId, string unitName, double nowTemp, double slopePerMin, double bound, double minutesToBreach, bool rising)
    {
        var ratePerHour = Math.Abs(slopePerMin) * 60;
        var verb = rising ? "rising" : "falling";
        var limitWord = rising ? "above" : "below";
        var message =
            $"{unitName} is {verb} (~{ratePerHour:0.0}°C/hr). Now {nowTemp:0.0}°C — projected to go {limitWord} {bound:0.0}°C in ~{Math.Round(minutesToBreach)} min. Check the unit before it breaches.";

        return new TemperaturePredictionDto(
            unitId,
            unitName,
            rising ? "Rising" : "Falling",
            Math.Round((decimal)nowTemp, 1),
            Math.Round((decimal)ratePerHour, 1),
            (decimal)bound,
            (int)Math.Round(minutesToBreach),
            message);
    }

    // Ordinary least-squares slope of temperature (Y, °C) over time (X, minutes). Returns false when
    // the x-values have no spread (can't fit a line).
    private static bool TryLinearSlope(IReadOnlyList<(double X, double Y)> points, out double slope)
    {
        slope = 0;
        var n = points.Count;
        double sumX = 0, sumY = 0, sumXy = 0, sumXx = 0;
        foreach (var (x, y) in points)
        {
            sumX += x;
            sumY += y;
            sumXy += x * y;
            sumXx += x * x;
        }

        var denom = (n * sumXx) - (sumX * sumX);
        if (Math.Abs(denom) < 1e-9) return false;

        slope = ((n * sumXy) - (sumX * sumY)) / denom;
        return true;
    }
}
