using ScratchCard.Domain.Common;

namespace ScratchCard.Domain.Entities;

public class ShopPaymentType : SoftDeletableAuditableEntity
{
    public Guid ShopId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Code { get; set; }
    // Comma-separated keywords used to auto-detect this payment type from till-report descriptions
    // (e.g. "card,visa,mastercard,debit,contactless"). Case-insensitive contains match.
    public string? Keywords { get; set; }
    public int SortOrder { get; set; }
    public bool IsActive { get; set; } = true;

    public Shop Shop { get; set; } = null!;
}
