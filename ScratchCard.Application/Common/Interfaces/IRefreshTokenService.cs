using ScratchCard.Domain.Entities;

namespace ScratchCard.Application.Common.Interfaces;

/// <summary>
/// Issues, looks up and revokes rotating refresh tokens. Only token hashes are persisted; the raw
/// token is returned once on issue and never stored.
/// </summary>
public interface IRefreshTokenService
{
    /// <summary>Creates and persists a new refresh token for the user, returning the raw value.</summary>
    Task<string> IssueAsync(Guid userId, CancellationToken cancellationToken = default);

    /// <summary>Finds the (tracked) refresh-token row matching the raw value, regardless of state,
    /// or null if no such token exists. Returned tracked so the caller can rotate/revoke it.</summary>
    Task<UserRefreshToken?> FindByRawAsync(string rawToken, CancellationToken cancellationToken = default);

    /// <summary>Revokes every still-active refresh token for the user. Used as the reuse/theft
    /// response when an already-rotated token is replayed.</summary>
    Task RevokeAllActiveForUserAsync(Guid userId, CancellationToken cancellationToken = default);

    /// <summary>Hash used for storage/lookup. Exposed so callers can link rotation chains.</summary>
    string Hash(string rawToken);
}
