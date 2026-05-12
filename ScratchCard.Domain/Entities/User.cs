using ScratchCard.Domain.Common;

namespace ScratchCard.Domain.Entities;

public class User : AuditableEntity
{
    public string Email { get; set; } = string.Empty;
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string ExternalProvider { get; set; } = string.Empty;
    public string ExternalProviderUserId { get; set; } = string.Empty;
    public string? PasswordHash { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset? LastLoginOn { get; set; }

    public ICollection<ShopUser> ShopUsers { get; set; } = new List<ShopUser>();
}
