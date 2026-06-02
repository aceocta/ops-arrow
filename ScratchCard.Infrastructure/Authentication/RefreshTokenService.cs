using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Domain.Entities;

namespace ScratchCard.Infrastructure.Authentication;

public class RefreshTokenService : IRefreshTokenService
{
    private readonly IRepository<UserRefreshToken> _repository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly AppJwtOptions _options;

    public RefreshTokenService(
        IRepository<UserRefreshToken> repository,
        IUnitOfWork unitOfWork,
        IOptions<AppJwtOptions> options)
    {
        _repository = repository;
        _unitOfWork = unitOfWork;
        _options = options.Value;
    }

    public async Task<string> IssueAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var rawToken = GenerateRawToken();
        var entity = new UserRefreshToken
        {
            UserId = userId,
            TokenHash = Hash(rawToken),
            ExpiresOn = DateTimeOffset.UtcNow.AddDays(Math.Max(1, _options.RefreshTokenExpiryDays)),
        };

        await _repository.AddAsync(entity, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return rawToken;
    }

    public async Task<UserRefreshToken?> FindByRawAsync(string rawToken, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(rawToken))
        {
            return null;
        }

        var hash = Hash(rawToken);
        // Tracked (no AsNoTracking) so the caller can rotate/revoke the row in place.
        return await _repository.Query().FirstOrDefaultAsync(x => x.TokenHash == hash, cancellationToken);
    }

    public async Task RevokeAllActiveForUserAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var now = DateTimeOffset.UtcNow;
        var active = await _repository.Query()
            .Where(x => x.UserId == userId && x.RevokedOn == null)
            .ToListAsync(cancellationToken);

        if (active.Count == 0)
        {
            return;
        }

        foreach (var token in active)
        {
            token.RevokedOn = now;
        }
        await _unitOfWork.SaveChangesAsync(cancellationToken);
    }

    public string Hash(string rawToken)
    {
        var hashBytes = SHA256.HashData(Encoding.UTF8.GetBytes(rawToken));
        return Convert.ToBase64String(hashBytes);
    }

    private static string GenerateRawToken()
    {
        // 256 bits of entropy, URL-safe so it survives transport/storage untouched.
        var bytes = RandomNumberGenerator.GetBytes(32);
        return Convert.ToBase64String(bytes)
            .Replace("+", "-")
            .Replace("/", "_")
            .TrimEnd('=');
    }
}
