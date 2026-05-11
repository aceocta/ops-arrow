using ScratchCard.Domain.Common;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Domain.Entities;

public class UserInvitation : AuditableEntity
{
    public Guid ShopId { get; set; }
    public string Email { get; set; } = string.Empty;
    public Guid RoleId { get; set; }
    public string InvitationTokenHash { get; set; } = string.Empty;
    public InvitationStatus Status { get; set; } = InvitationStatus.Pending;
    public DateTimeOffset ExpiresOn { get; set; }
    public DateTimeOffset? AcceptedOn { get; set; }
    public Guid? AcceptedByUserId { get; set; }
    public DateTimeOffset? CancelledOn { get; set; }
    public Guid? CancelledByUserId { get; set; }
    public Guid InvitedByUserId { get; set; }

    public Shop Shop { get; set; } = null!;
    public Role Role { get; set; } = null!;
}
