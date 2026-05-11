using Google.Apis.Auth;
using Microsoft.Extensions.Options;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;

namespace ScratchCard.Infrastructure.Authentication;

public class GoogleTokenValidator : IGoogleTokenValidator
{
    private readonly GoogleAuthOptions _options;

    public GoogleTokenValidator(IOptions<GoogleAuthOptions> options)
    {
        _options = options.Value;
    }

    public async Task<GoogleIdentityInfo> ValidateIdTokenAsync(string idToken, CancellationToken cancellationToken = default)
    {
        var allowedClientIds = _options.AllowedClientIds.Where(x => !string.IsNullOrWhiteSpace(x)).ToArray();
        if (allowedClientIds.Length == 0)
        {
            throw new AppException("google_configuration_missing", "Google client IDs are not configured.", 500);
        }

        GoogleJsonWebSignature.Payload payload;
        try
        {
            payload = await GoogleJsonWebSignature.ValidateAsync(
                idToken,
                new GoogleJsonWebSignature.ValidationSettings
                {
                    Audience = allowedClientIds
                });
        }
        catch (Exception)
        {
            throw new AppException("invalid_google_token", "Google ID token is invalid.", 401);
        }

        return new GoogleIdentityInfo
        {
            Subject = payload.Subject,
            Email = payload.Email,
            FirstName = payload.GivenName ?? string.Empty,
            LastName = payload.FamilyName ?? string.Empty,
            EmailVerified = payload.EmailVerified
        };
    }
}
