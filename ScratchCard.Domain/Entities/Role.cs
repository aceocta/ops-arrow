using ScratchCard.Domain.Common;

namespace ScratchCard.Domain.Entities;

public class Role : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;

    public ICollection<ShopUser> ShopUsers { get; set; } = new List<ShopUser>();
    public ICollection<UserInvitation> UserInvitations { get; set; } = new List<UserInvitation>();
}
