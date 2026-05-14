namespace ScratchCard.Application.DTOs.Auth;

public class CurrentUserProfileDto
{
    public Guid UserId { get; set; }
    public string Email { get; set; } = string.Empty;
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string DisplayName => $"{FirstName} {LastName}".Trim();
    public IReadOnlyCollection<string> Roles { get; set; } = [];
    public IReadOnlyCollection<UserShopDto> Shops { get; set; } = [];
    public bool HasCompanySetup { get; set; }
    public bool HasShopSetup { get; set; }
    public Guid? PrimaryCompanyId { get; set; }
}

public class UserShopDto
{
    public Guid ShopId { get; set; }
    public Guid? CompanyId { get; set; }
    public string? CompanyName { get; set; }
    public string ShopName { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
}

public class PasswordLoginRequest
{
    public string Email { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
}

public class PasswordSignupRequest
{
    public string Email { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public string? FirstName { get; set; }
    public string? LastName { get; set; }
}

public class DevLoginRequest
{
    public string Email { get; set; } = string.Empty;
    public string? FirstName { get; set; }
    public string? LastName { get; set; }
    public string Role { get; set; } = "ShopOwner";
    public Guid? ShopId { get; set; }
}

public class ForgotPasswordRequest
{
    public string Email { get; set; } = string.Empty;
}

public class ResetPasswordRequest
{
    public string Token { get; set; } = string.Empty;
    public string NewPassword { get; set; } = string.Empty;
}

public class AuthTokenResponseDto
{
    public string AccessToken { get; set; } = string.Empty;
    public DateTimeOffset ExpiresOn { get; set; }
    public string TokenType { get; set; } = "Bearer";
    public CurrentUserProfileDto Profile { get; set; } = new();
}
