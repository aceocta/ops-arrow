using ScratchCard.Domain.Common;

namespace ScratchCard.Domain.Entities;

/// <summary>
/// A long-lived refresh token used to mint new access tokens without re-login. Only a hash of the
/// token is stored (never the raw value). Tokens are single-use and rotated: each refresh revokes
/// the presented token and issues a fresh one, with <see cref="ReplacedByTokenHash"/> linking the
/// chain so a replayed (already-rotated) token can be detected as a reuse/theft signal.
/// </summary>
public class UserRefreshToken : AuditableEntity
{
    public Guid UserId { get; set; }

    /// <summary>SHA-256 (base64) hash of the raw refresh token. The raw value is never persisted.</summary>
    public string TokenHash { get; set; } = string.Empty;

    public DateTimeOffset ExpiresOn { get; set; }

    /// <summary>Set when the token is rotated (on use) or explicitly revoked (logout / reuse).</summary>
    public DateTimeOffset? RevokedOn { get; set; }

    /// <summary>Hash of the token that superseded this one when rotated — for reuse-chain detection.</summary>
    public string? ReplacedByTokenHash { get; set; }

    public User User { get; set; } = null!;

    public bool IsActive(DateTimeOffset now) => RevokedOn is null && ExpiresOn > now;
}
