using ScratchCard.Domain.Common;

namespace ScratchCard.Domain.Entities;

public class UserRole : AuditableEntity
{
    public Guid UserId { get; set; }
    public Guid RoleId { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset AssignedOn { get; set; } = DateTimeOffset.UtcNow;

    public User User { get; set; } = null!;
    public Role Role { get; set; } = null!;
}
