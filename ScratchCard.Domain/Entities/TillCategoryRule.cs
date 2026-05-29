using ScratchCard.Domain.Common;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Domain.Entities;

public class TillCategoryRule : SoftDeletableAuditableEntity
{
    public Guid ShopId { get; set; }
    public string Pattern { get; set; } = string.Empty;
    public TillRuleMatchType MatchType { get; set; } = TillRuleMatchType.Contains;
    public TillLineClassification Classification { get; set; } = TillLineClassification.Income;
    public int Priority { get; set; }
    public bool IsActive { get; set; } = true;

    public Shop Shop { get; set; } = null!;
}
