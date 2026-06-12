namespace ScratchCard.Application.DTOs.Users;

public class UserDto
{
    public Guid Id { get; set; }
    public string Email { get; set; } = string.Empty;
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string? PhoneNumber { get; set; }
    public string DisplayName => $"{FirstName} {LastName}".Trim();
    public bool IsActive { get; set; }
    public DateTimeOffset? LastLoginOn { get; set; }
    public string RoleName { get; set; } = string.Empty;
}

public class UpdateUserRoleRequest
{
    public Guid ShopId { get; set; }
    public Guid RoleId { get; set; }
}

public class DeleteMyAccountRequest
{
    /// <summary>
    /// Current password. Required when the account has a password set; ignored for SSO-only
    /// accounts (no password hash), which can delete without it.
    /// </summary>
    public string? Password { get; set; }

    /// <summary>Must be exactly "DELETE" (case-sensitive) to confirm the irreversible action.</summary>
    public string Confirmation { get; set; } = string.Empty;
}

public class UpdateUserProfileRequest
{
    public string? FirstName { get; set; }
    public string? LastName { get; set; }
    /// <summary>
    /// Optional international-format phone number, e.g. "+447911123456". Set to empty/null
    /// to clear. Never validated beyond a basic E.164-shape check; users may type spaces or
    /// dashes — the WhatsApp sender normalises before use.
    /// </summary>
    public string? PhoneNumber { get; set; }
}
