using System.Text.RegularExpressions;

namespace ScratchCard.Application.Common.Helpers;

/// <summary>
/// Strips quantity-style noise out of till-report line descriptions so that the system treats the
/// same product the same way regardless of how many were sold (e.g. "Unleaded 12" and
/// "Unleaded 5" both normalise to "Unleaded"). Used before sending lines to the AI, when matching
/// shop rules, and when persisting learned rules.
/// </summary>
public static class TillDescriptionNormalizer
{
    // Standalone number, optionally with a decimal/comma fragment (covers "5", "12", "1.5", "1,234").
    private static readonly Regex NumberRegex = new(@"\b\d+(?:[.,]\d+)?\b", RegexOptions.Compiled);
    // Isolated multiplier / qty markers — "x", "×", "@", "qty" / "qty." as their own token.
    private static readonly Regex QtyMarkerRegex = new(
        @"(?<=^|\s)(?:x|×|@|qty\.?)(?=\s|$)",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex WhitespaceRegex = new(@"\s{2,}", RegexOptions.Compiled);

    public static string Normalize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        // Till-report convention: the description is everything BEFORE the first ':'.
        // Anything after it (value, qty, amount) is dropped.
        var colonIndex = value.IndexOf(':');
        var text = colonIndex >= 0 ? value[..colonIndex] : value;

        text = NumberRegex.Replace(text, " ");
        text = QtyMarkerRegex.Replace(text, " ");
        text = WhitespaceRegex.Replace(text, " ");
        return text.Trim();
    }
}
