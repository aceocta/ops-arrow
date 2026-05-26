using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Services;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Entities;

namespace ScratchCard.Application.Services;

public class ShopMembershipService : IShopMembershipService
{
    private readonly IRepository<ShopUser> _shopUserRepository;
    private readonly ICurrentUserService _currentUserService;

    public ShopMembershipService(
        IRepository<ShopUser> shopUserRepository,
        ICurrentUserService currentUserService)
    {
        _shopUserRepository = shopUserRepository;
        _currentUserService = currentUserService;
    }

    public async Task<string?> GetShopRoleAsync(Guid userId, Guid shopId, CancellationToken cancellationToken = default)
    {
        return await _shopUserRepository.Query()
            .AsNoTracking()
            .Where(x => x.UserId == userId && x.ShopId == shopId && x.IsActive)
            .Include(x => x.Role)
            .Select(x => x.Role.Name)
            .FirstOrDefaultAsync(cancellationToken);
    }

    public async Task EnsureCurrentUserShopRoleAsync(Guid shopId, IEnumerable<string> allowedRoles, CancellationToken cancellationToken = default)
    {
        // Platform admins bypass (support escape hatch — same as the attribute).
        if (_currentUserService.IsInRole(RoleNames.PlatformAdmin))
        {
            return;
        }

        if (!_currentUserService.UserId.HasValue)
        {
            throw new AppException("unauthorized", "User context is missing.", 401);
        }

        var role = await GetShopRoleAsync(_currentUserService.UserId.Value, shopId, cancellationToken);
        if (string.IsNullOrEmpty(role))
        {
            throw new AppException("shop_membership_missing", "You are not a member of this shop.", 403);
        }

        var allowed = allowedRoles.ToArray();
        if (!allowed.Any(r => string.Equals(r, role, StringComparison.OrdinalIgnoreCase)))
        {
            throw new AppException(
                "shop_role_insufficient",
                $"Your role at this shop ({role}) doesn't permit this action. Required: {string.Join(" or ", allowed)}.",
                403);
        }
    }
}
