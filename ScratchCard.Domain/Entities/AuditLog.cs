using ScratchCard.Domain.Common;

namespace ScratchCard.Domain.Entities;

public class AuditLog : BaseEntity
{
    public Guid? ShopId { get; set; }
    public string EntityName { get; set; } = string.Empty;
    public Guid? EntityId { get; set; }
    public string ActionType { get; set; } = string.Empty;
    public string? OldValue { get; set; }
    public string? NewValue { get; set; }
    public Guid? ChangedByUserId { get; set; }
    public DateTimeOffset ChangedOn { get; set; } = DateTimeOffset.UtcNow;
    public string? Reason { get; set; }
    public string? IpAddress { get; set; }
}
