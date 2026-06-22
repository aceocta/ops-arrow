using ScratchCard.Application.DTOs.TemperatureLogs;

namespace ScratchCard.Application.Common.Interfaces;

/// <summary>
/// Early-warning temperature analysis: fits a short-term trend to each unit's recent readings and
/// reports the ones projected to cross their min/max soon. Used both by the periodic background sweep
/// and by the on-demand "check now" trigger from the apps.
/// </summary>
public interface ITemperaturePredictionService
{
    /// <summary>Computes predictions for a shop's active units. Pure read — no notifications sent.</summary>
    Task<TemperaturePredictiveCheckResult> EvaluateAsync(Guid shopId, CancellationToken cancellationToken = default);

    /// <summary>Sends a push alert for each prediction (gated by the shop's alerts entitlement).</summary>
    Task DispatchAsync(Guid shopId, IReadOnlyList<TemperaturePredictionDto> predictions, CancellationToken cancellationToken = default);
}
