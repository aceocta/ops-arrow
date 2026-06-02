using ScratchCard.Application.DTOs.Auth;
using ScratchCard.Domain.Entities;

namespace ScratchCard.Application.Common.Interfaces;

public interface IJwtTokenService
{
    /// <summary>Mints an access token and a fresh rotating refresh token for the user. The returned
    /// DTO carries both; the refresh token row is persisted as a side effect.</summary>
    Task<AuthTokenResponseDto> CreateTokenAsync(
        User user,
        IReadOnlyCollection<string> roles,
        CancellationToken cancellationToken = default);
}
