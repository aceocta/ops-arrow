using ScratchCard.Domain.Common;

namespace ScratchCard.Domain.Entities;

public class User : AuditableEntity
{
    public string Email { get; set; } = string.Empty;
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    /// <summary>
    /// Optional phone number in international format (e.g. "+447911123456"). Used to route
    /// WhatsApp notifications to managers and owners. Captured at signup, invitation accept,
    /// and via the Settings user-edit screen — never mandatory.
    /// </summary>
    public string? PhoneNumber { get; set; }
    public string ExternalProvider { get; set; } = string.Empty;
    public string ExternalProviderUserId { get; set; } = string.Empty;
    public string? PasswordHash { get; set; }
    public string? PasswordResetTokenHash { get; set; }
    public DateTimeOffset? PasswordResetTokenExpiresOn { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset? LastLoginOn { get; set; }
    /// <summary>
    /// Security stamp ("token version"). Embedded in every access token as the "sst" claim and
    /// re-checked per request; bumping it to a new value immediately invalidates all previously
    /// issued access tokens (deactivation, role change, password reset, account deletion).
    /// </summary>
    public Guid SecurityStamp { get; set; } = Guid.NewGuid();

    public ICollection<ShopUser> ShopUsers { get; set; } = new List<ShopUser>();
    public ICollection<UserRole> UserRoles { get; set; } = new List<UserRole>();
}
