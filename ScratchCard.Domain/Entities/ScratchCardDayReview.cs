using ScratchCard.Domain.Common;

namespace ScratchCard.Domain.Entities;

public class ScratchCardDayReview : AuditableEntity
{
    public Guid BusinessDayId { get; set; }
    public decimal? TillPayout { get; set; }
    public decimal? ScratchCardSummaryPayout { get; set; }
    public string? Note { get; set; }
    public Guid? ReviewedByUserId { get; set; }
    public DateTimeOffset? ReviewedAt { get; set; }

    public BusinessDay BusinessDay { get; set; } = null!;
    public User? ReviewedByUser { get; set; }
}
