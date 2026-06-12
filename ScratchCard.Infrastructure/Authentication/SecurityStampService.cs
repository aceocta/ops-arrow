using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Domain.Entities;

namespace ScratchCard.Infrastructure.Authentication;

/// <summary>
/// Stores and validates the per-user security stamp ("token version"). Validation results are
/// cached in-memory for a short TTL so the per-request OnTokenValidated hook does not hit the
/// database on every call. BumpAsync invalidates the cache entry, so revocation is immediate on
/// the bumping instance; other instances converge within the TTL.
/// </summary>
public class SecurityStampService : ISecurityStampService
{
    /// <summary>How long a stamp lookup may be served from cache (revocation lag on other instances).</summary>
    private static readonly TimeSpan CacheTtl = TimeSpan.FromSeconds(90);

    private readonly IRepository<User> _userRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IMemoryCache _cache;

    public SecurityStampService(
        IRepository<User> userRepository,
        IUnitOfWork unitOfWork,
        IMemoryCache cache)
    {
        _userRepository = userRepository;
        _unitOfWork = unitOfWork;
        _cache = cache;
    }

    public async Task BumpAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var user = await _userRepository.Query()
            .FirstOrDefaultAsync(x => x.Id == userId, cancellationToken);
        if (user is null)
        {
            return;
        }

        user.SecurityStamp = Guid.NewGuid();
        user.ModifiedOn = DateTimeOffset.UtcNow;
        _userRepository.Update(user);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        // Same-instance revocation is immediate; other instances catch up within CacheTtl.
        _cache.Remove(CacheKey(userId));
    }

    public async Task<bool> ValidateAsync(Guid userId, Guid stamp, CancellationToken cancellationToken = default)
    {
        var cacheKey = CacheKey(userId);
        if (!_cache.TryGetValue(cacheKey, out StampSnapshot? snapshot) || snapshot is null)
        {
            snapshot = await _userRepository.Query()
                .AsNoTracking()
                .Where(x => x.Id == userId)
                .Select(x => new StampSnapshot(x.SecurityStamp, x.IsActive))
                .FirstOrDefaultAsync(cancellationToken)
                ?? StampSnapshot.Missing;

            _cache.Set(cacheKey, snapshot, CacheTtl);
        }

        return snapshot.Exists && snapshot.IsActive && snapshot.SecurityStamp == stamp;
    }

    private static string CacheKey(Guid userId) => $"sst:{userId:N}";

    private sealed record StampSnapshot(Guid SecurityStamp, bool IsActive)
    {
        public static readonly StampSnapshot Missing = new(Guid.Empty, false) { Exists = false };

        public bool Exists { get; init; } = true;
    }
}
