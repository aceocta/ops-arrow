namespace ScratchCard.Application.Common.Interfaces;

public interface IGoogleTokenValidator
{
    Task<GoogleIdentityInfo> ValidateIdTokenAsync(string idToken, CancellationToken cancellationToken = default);
}

public class GoogleIdentityInfo
{
    public string Subject { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public bool EmailVerified { get; set; }
}
