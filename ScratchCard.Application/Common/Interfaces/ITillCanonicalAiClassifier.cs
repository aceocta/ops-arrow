using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.Common.Interfaces;

/// <summary>
/// Batch AI fallback that maps OCR'd line descriptions directly to canonical fields. Used during
/// ingest for the lines the deterministic resolver left Unmapped. Never throws — returns an empty
/// map on any failure so callers degrade to manual mapping.
/// </summary>
public interface ITillCanonicalAiClassifier
{
    Task<IReadOnlyDictionary<int, TillCanonicalField>> ClassifyAsync(
        IReadOnlyCollection<TillLineDescriptor> items,
        CancellationToken cancellationToken = default);
}
