using ScratchCard.Application.Common.Models;
using ScratchCard.Domain.Entities;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.Common.Interfaces;

public interface ITillRuleEngine
{
    TillClassificationOutcome Classify(IReadOnlyCollection<TillCategoryRule> rules, TillOcrLine line);
}

public readonly record struct TillClassificationOutcome(
    TillLineClassification Classification,
    TillLineSource Source,
    Guid? MatchedRuleId);
