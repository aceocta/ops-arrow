namespace ScratchCard.Application.DTOs.Users;

public class UserDto
{
    public Guid Id { get; set; }
    public string Email { get; set; } = string.Empty;
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
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
