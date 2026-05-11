using ScratchCard.Domain.Common;

namespace ScratchCard.Domain.Entities;

public class RefusalRegisterDailySignoff : AuditableEntity
{
    public Guid ShopId { get; set; }
    public DateOnly SignoffDate { get; set; }
    public Guid SignedByUserId { get; set; }
    public string SignedByInitials { get; set; } = string.Empty;
    public string SignedByName { get; set; } = string.Empty;
    public DateTimeOffset SignedOn { get; set; }
    public string? Notes { get; set; }
    public string? SignatureImagePath { get; set; }

    public Shop Shop { get; set; } = null!;
}
