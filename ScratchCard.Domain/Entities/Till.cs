using ScratchCard.Domain.Common;

namespace ScratchCard.Domain.Entities;

public class Till : SoftDeletableAuditableEntity
{
    public Guid ShopId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Code { get; set; }
    public bool IsActive { get; set; } = true;
    /// <summary>Default opening float for this till — pre-fills a new reconciliation's opening float.</summary>
    public decimal DefaultFloat { get; set; }

    public Shop Shop { get; set; } = null!;
}
