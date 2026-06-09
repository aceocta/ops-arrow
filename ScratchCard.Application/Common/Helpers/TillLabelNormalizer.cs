using ScratchCard.Domain.Constants;

namespace ScratchCard.Application.Common.Helpers;

/// <summary>
/// Normalizes a raw printed till label into a stable match key (UPPERCASE, alphanumeric only).
/// Delegates to <see cref="TillAliasDictionary.Normalize"/> so seeded, learned and incoming keys
/// are produced by exactly one implementation. OCR typos are handled by the resolver's fuzzy layer,
/// not here (folding digits would corrupt keys like "VAT20").
/// </summary>
public static class TillLabelNormalizer
{
    public static string Normalize(string? raw) => TillAliasDictionary.Normalize(raw);
}
