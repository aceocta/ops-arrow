using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.Common.Interfaces;

/// <summary>The outcome of resolving a printed label to a canonical field code (built-in or custom).</summary>
public sealed record TillLabelResolution(
    string Code,
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

    /// <summary>Persist a confirmed/corrected mapping (field code) at the given scope so it wins next time.</summary>
    Task LearnAsync(
        string rawLabel,
        string code,
        TillMappingScope scope,
        Guid? scopeId,
        string? section = null,
        CancellationToken cancellationToken = default);

    /// <summary>Remove any learned mapping for this label at the given scope (undo a learned assign/ignore).</summary>
    Task ForgetAsync(
        string rawLabel,
        TillMappingScope scope,
        Guid? scopeId,
        CancellationToken cancellationToken = default);
}
