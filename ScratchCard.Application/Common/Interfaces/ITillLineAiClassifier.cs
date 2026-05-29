using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.Common.Interfaces;

public interface ITillLineAiClassifier
{
    /// <summary>
    /// Classifies till-report line descriptions as income or expense. Only the (redacted)
    /// description text is sent to the provider — never the amount. Returns a map of the supplied
    /// item id to the decision; ids the model couldn't decide are omitted. Never throws: on any
    /// failure (not configured, provider error) it returns an empty map so callers fall back to
    /// manual tagging.
    /// </summary>
    Task<IReadOnlyDictionary<int, TillLineClassification>> ClassifyAsync(
        IReadOnlyCollection<TillLineDescriptor> items,
        CancellationToken cancellationToken = default);
}

public sealed record TillLineDescriptor(int Id, string Description);
