namespace ScratchCard.Application.Common.Interfaces;

/// <summary>
/// Token-version ("security stamp") revocation. Every access token carries the user's current
/// stamp as the "sst" claim; <see cref="ValidateAsync"/> is called on every authenticated request
/// and <see cref="BumpAsync"/> rotates the stamp — instantly invalidating all outstanding access
/// tokens for that user (deactivation, shop-role change, password reset, account deletion).
/// Ordinary logout does NOT bump (refresh-token revocation covers it; bumping would sign the
/// user out of every other device).
/// </summary>
public interface ISecurityStampService
{
    /// <summary>
    /// Replaces the user's security stamp with a new value, persists it, and invalidates the
    /// local validation cache so the change takes effect immediately on this instance.
    /// No-op if the user does not exist.
    /// </summary>
    Task BumpAsync(Guid userId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Returns true when the user exists, is active, and <paramref name="stamp"/> matches the
    /// user's current security stamp. Lookups are cached briefly per user to avoid a DB hit on
    /// every request.
    /// </summary>
    Task<bool> ValidateAsync(Guid userId, Guid stamp, CancellationToken cancellationToken = default);
}
