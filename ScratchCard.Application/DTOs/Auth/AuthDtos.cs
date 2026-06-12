namespace ScratchCard.Application.DTOs.Auth;

public class CurrentUserProfileDto
{
    public Guid UserId { get; set; }
    public string Email { get; set; } = string.Empty;
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    /// <summary>Optional phone (international format) — null when not yet provided by the user.</summary>
    public string? PhoneNumber { get; set; }
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
    public bool IsFuelStation { get; set; }
    /// <summary>First day of the shop's week: 0 = Sunday … 6 = Saturday (JS getDay() convention).
    /// Clients use this for every calendar-week boundary (rota week picker, "this week" ranges).</summary>
    public int WeekStartDay { get; set; } = 1;
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
    public string VerificationCode { get; set; } = string.Empty;
    public string? FirstName { get; set; }
    public string? LastName { get; set; }
}

public class SignupEmailVerificationRequest
{
    public string Email { get; set; } = string.Empty;
}

public class SignupEmailVerificationResponse
{
    public DateTimeOffset ExpiresOn { get; set; }
}

public class DevLoginRequest
{
    public string Email { get; set; } = string.Empty;
    public string? FirstName { get; set; }
    public string? LastName { get; set; }
    public string Role { get; set; } = "CompanyOwner";
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
    /// <summary>Long-lived rotating refresh token. The client stores this and exchanges it for a
    /// new access token (via /auth/refresh-token) when the access token expires.</summary>
    public string RefreshToken { get; set; } = string.Empty;
    public CurrentUserProfileDto Profile { get; set; } = new();
}

public class RefreshAccessTokenRequest
{
    public string RefreshToken { get; set; } = string.Empty;
}

public class LogoutRequest
{
    public string RefreshToken { get; set; } = string.Empty;
}

