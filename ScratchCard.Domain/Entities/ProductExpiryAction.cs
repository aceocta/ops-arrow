using ScratchCard.Domain.Common;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Domain.Entities;

/// <summary>
/// An action taken on a batch (move to front, discount, mark sold, donate, return, dispose).
/// Append-only audit; <see cref="Quantity"/> decrements the batch's RemainingQuantity and feeds the
/// binned-vs-saved scoreboard. Manager-review fields are populated in a later phase.
/// </summary>
public class ProductExpiryAction : AuditableEntity
{
    public Guid ProductBatchId { get; set; }
    public ProductExpiryActionType ActionType { get; set; }
    public int Quantity { get; set; }
    public string? Comment { get; set; }
    public Guid PerformedByUserId { get; set; }
    public DateTimeOffset PerformedOn { get; set; } = DateTimeOffset.UtcNow;

    public ProductBatch ProductBatch { get; set; } = null!;
}
