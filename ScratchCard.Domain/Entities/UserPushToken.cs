using ScratchCard.Domain.Common;

namespace ScratchCard.Domain.Entities;

public class UserPushToken : AuditableEntity
{
    public Guid ShopId { get; set; }
    public Guid UserId { get; set; }
    public string PushToken { get; set; } = string.Empty;
    public string Platform { get; set; } = string.Empty;
    public string? DeviceName { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset RegisteredOn { get; set; } = DateTimeOffset.UtcNow;

    public Shop Shop { get; set; } = null!;
    public User User { get; set; } = null!;
}
