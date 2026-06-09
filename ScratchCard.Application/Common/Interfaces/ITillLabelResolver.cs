using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.Common.Interfaces;

/// <summary>The outcome of resolving a printed label to a canonical field.</summary>
public sealed record TillLabelResolution(
    TillCanonicalField Field,
    double Confidence,
    TillMappingSource Source,
    string NormalizedLabel);

/// <summary>
/// Resolves a raw printed till/terminal label to a <see cref="TillCanonicalField"/> using the
/// tiered cascade: Till-scope learned → Shop-scope → Global seed → fuzzy → (AI later) → Unmapped.
/// Also records confirmations so a till "learns" its wording once.
/// </summary>
public interface ITillLabelResolver
{
    Task<TillLabelResolution> ResolveAsync(
        string rawLabel,
        Guid? shopId,
        Guid? tillId,
        string? section = null,
        CancellationToken cancellationToken = default);

    /// <summary>Persist a confirmed/corrected mapping at the given scope (default Till) so it wins next time.</summary>
    Task LearnAsync(
        string rawLabel,
        TillCanonicalField field,
        TillMappingScope scope,
        Guid? scopeId,
        string? section = null,
        CancellationToken cancellationToken = default);
}
