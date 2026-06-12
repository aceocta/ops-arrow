using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.DTOs.Auth;
using ScratchCard.Domain.Entities;

namespace ScratchCard.Infrastructure.Authentication;

public class JwtTokenService : IJwtTokenService
{
    private readonly AppJwtOptions _options;
    private readonly IRefreshTokenService _refreshTokenService;

    public JwtTokenService(IOptions<AppJwtOptions> options, IRefreshTokenService refreshTokenService)
    {
        _options = options.Value;
        _refreshTokenService = refreshTokenService;
    }

    public async Task<AuthTokenResponseDto> CreateTokenAsync(
        User user,
        IReadOnlyCollection<string> roles,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(_options.Secret) || _options.Secret.Length < 32)
        {
            throw new AppException("jwt_configuration_invalid", "JWT secret must be configured with at least 32 characters.", 500);
        }

        var now = DateTimeOffset.UtcNow;
        var expiresOn = now.AddMinutes(_options.AccessTokenExpiryMinutes);
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_options.Secret));
        var displayName = BuildDisplayName(user.FirstName, user.LastName, user.Email);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(JwtRegisteredClaimNames.Email, user.Email),
            new(ClaimTypes.Email, user.Email),
            new(ClaimTypes.Name, displayName),
            new(ClaimTypes.GivenName, user.FirstName),
            new(ClaimTypes.Surname, user.LastName),
            new("provider", "Google"),
            // Security stamp ("token version"): validated on every request so bumping the stamp
            // (deactivation, role change, password reset, account deletion) revokes this token.
            new("sst", user.SecurityStamp.ToString())
        };

        claims.AddRange(roles.Select(role => new Claim(ClaimTypes.Role, role)));

        var tokenDescriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(claims),
            Expires = expiresOn.UtcDateTime,
            Issuer = _options.Issuer,
            Audience = _options.Audience,
            SigningCredentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256)
        };

        var handler = new JwtSecurityTokenHandler();
        var token = handler.CreateToken(tokenDescriptor);

        var refreshToken = await _refreshTokenService.IssueAsync(user.Id, cancellationToken);

        return new AuthTokenResponseDto
        {
            AccessToken = handler.WriteToken(token),
            ExpiresOn = expiresOn,
            RefreshToken = refreshToken
        };
    }

    private static string BuildDisplayName(string firstName, string lastName, string email)
    {
        var displayName = $"{firstName} {lastName}".Trim();
        if (!string.IsNullOrWhiteSpace(displayName))
        {
            return displayName;
        }

        var emailPrefix = email.Split('@', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault();
        return string.IsNullOrWhiteSpace(emailPrefix) ? "User" : emailPrefix;
    }
}
