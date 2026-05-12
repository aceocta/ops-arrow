using ScratchCard.Domain.Common;

namespace ScratchCard.Domain.Entities;

public class ShopUser : AuditableEntity
{
    public Guid ShopId { get; set; }
    public Guid UserId { get; set; }
    public Guid RoleId { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset JoinedOn { get; set; } = DateTimeOffset.UtcNow;
    public Guid? InvitedByUserId { get; set; }

    public Shop Shop { get; set; } = null!;
    public User User { get; set; } = null!;
    public Role Role { get; set; } = null!;
}
