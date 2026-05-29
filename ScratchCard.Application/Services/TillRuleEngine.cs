using System.Text.RegularExpressions;
using ScratchCard.Application.Common.Helpers;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Models;
using ScratchCard.Domain.Entities;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.Services;

/// <summary>
/// Deterministic, AI-free classifier. Resolution order: an explicit POS type code, then the
/// highest-priority matching per-shop rule, otherwise Unclassified (for manual tagging).
/// </summary>
public class TillRuleEngine : ITillRuleEngine
{
    private static readonly Dictionary<string, TillLineClassification> TypeCodeMap = new(StringComparer.OrdinalIgnoreCase)
    {
        ["SALE"] = TillLineClassification.Income,
        ["SALES"] = TillLineClassification.Income,
        ["CASH"] = TillLineClassification.Income,
        ["CARD"] = TillLineClassification.Income,
        ["REFUND"] = TillLineClassification.Expense,
        ["PAYOUT"] = TillLineClassification.Expense,
        ["VOID"] = TillLineClassification.Expense,
        ["EXPENSE"] = TillLineClassification.Expense,
        ["PURCHASE"] = TillLineClassification.Expense
    };

    public TillClassificationOutcome Classify(IReadOnlyCollection<TillCategoryRule> rules, TillOcrLine line)
    {
        if (!string.IsNullOrWhiteSpace(line.TypeCode)
            && TypeCodeMap.TryGetValue(line.TypeCode.Trim(), out var byCode))
        {
            return new TillClassificationOutcome(byCode, TillLineSource.TypeCode, null);
        }

        var description = line.Description ?? string.Empty;

        foreach (var rule in rules
            .Where(r => r.IsActive && !r.IsDeleted)
            .OrderBy(r => r.Priority)
            .ThenBy(r => r.Pattern))
        {
            if (Matches(rule, line, description))
            {
                return new TillClassificationOutcome(rule.Classification, TillLineSource.RuleEngine, rule.Id);
            }
        }

        return new TillClassificationOutcome(TillLineClassification.Unclassified, TillLineSource.Unclassified, null);
    }

    private static bool Matches(TillCategoryRule rule, TillOcrLine line, string description)
    {
        var pattern = rule.Pattern ?? string.Empty;
        if (pattern.Length == 0)
        {
            return false;
        }

        // For Contains/Equals we normalise both sides so qty noise ("Unleaded 5" vs "Unleaded")
        // doesn't break a learned/manual rule. Regex stays raw (user wrote it deliberately) and
        // TypeCode never carries a description.
        var normalizedDescription = TillDescriptionNormalizer.Normalize(description);
        var normalizedPattern = TillDescriptionNormalizer.Normalize(pattern);

        return rule.MatchType switch
        {
            TillRuleMatchType.Contains => normalizedDescription.Contains(normalizedPattern, StringComparison.OrdinalIgnoreCase),
            TillRuleMatchType.Equals => string.Equals(normalizedDescription, normalizedPattern, StringComparison.OrdinalIgnoreCase),
            TillRuleMatchType.TypeCode => !string.IsNullOrWhiteSpace(line.TypeCode)
                && string.Equals(line.TypeCode.Trim(), pattern, StringComparison.OrdinalIgnoreCase),
            TillRuleMatchType.Regex => TryRegex(pattern, description),
            _ => false
        };
    }

    private static bool TryRegex(string pattern, string description)
    {
        try
        {
            return Regex.IsMatch(description, pattern, RegexOptions.IgnoreCase, TimeSpan.FromMilliseconds(100));
        }
        catch (Exception)
        {
            // A malformed/runaway user-supplied pattern must not break classification.
            return false;
        }
    }
}
