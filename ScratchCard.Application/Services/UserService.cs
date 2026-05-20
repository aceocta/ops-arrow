using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Users;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Entities;

namespace ScratchCard.Application.Services;

public class UserService : IUserService
{
    private readonly IRepository<ShopUser> _shopUserRepository;
    private readonly IRepository<User> _userRepository;
    private readonly IRepository<Role> _roleRepository;
    private readonly IAuditService _auditService;
    private readonly ICurrentUserService _currentUserService;
    private readonly IUnitOfWork _unitOfWork;

    public UserService(
        IRepository<ShopUser> shopUserRepository,
        IRepository<User> userRepository,
        IRepository<Role> roleRepository,
        IAuditService auditService,
        ICurrentUserService currentUserService,
        IUnitOfWork unitOfWork)
    {
        _shopUserRepository = shopUserRepository;
        _userRepository = userRepository;
        _roleRepository = roleRepository;
        _auditService = auditService;
        _currentUserService = currentUserService;
        _unitOfWork = unitOfWork;
    }

    public async Task<IReadOnlyCollection<UserDto>> ListUsersAsync(Guid shopId, CancellationToken cancellationToken = default)
    {
        await EnsureCanManageShopUsersAsync(shopId, cancellationToken);

        return await _shopUserRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId)
            .Include(x => x.User)
            .Include(x => x.Role)
            .Select(x => new UserDto
            {
                Id = x.UserId,
                Email = x.User.Email,
                FirstName = x.User.FirstName,
                LastName = x.User.LastName,
                IsActive = x.User.IsActive && x.IsActive,
                LastLoginOn = x.User.LastLoginOn,
                RoleName = x.Role.Name
            })
            .ToListAsync(cancellationToken);
    }

    public async Task UpdateRoleAsync(Guid userId, UpdateUserRoleRequest request, CancellationToken cancellationToken = default)
    {
        await EnsureCanManageShopUsersAsync(request.ShopId, cancellationToken);

        var targetRole = await _roleRepository.Query()
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == request.RoleId && x.IsActive, cancellationToken)
            ?? throw new AppException("role_not_found", "Role not found.", 404);

        if (string.Equals(targetRole.Name, RoleNames.PlatformAdmin, StringComparison.OrdinalIgnoreCase)
            && !_currentUserService.IsInRole(RoleNames.PlatformAdmin))
        {
            throw new AppException("unauthorized_role", "Only platform admin can assign PlatformAdmin role.", 403);
        }

        var link = await _shopUserRepository.Query()
            .FirstOrDefaultAsync(x => x.UserId == userId && x.ShopId == request.ShopId, cancellationToken)
            ?? throw new AppException("shop_user_not_found", "Shop user assignment not found.", 404);

        var oldRoleId = link.RoleId;
        link.RoleId = request.RoleId;
        link.ModifiedOn = DateTimeOffset.UtcNow;
        link.ModifiedBy = _currentUserService.UserId;

        _shopUserRepository.Update(link);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(
            nameof(ShopUser),
            link.Id,
            "RoleChanged",
            request.ShopId,
            oldValue: oldRoleId.ToString(),
            newValue: request.RoleId.ToString(),
            cancellationToken: cancellationToken);
    }

    public async Task SetActiveAsync(Guid userId, Guid shopId, bool isActive, CancellationToken cancellationToken = default)
    {
        await EnsureCanManageShopUsersAsync(shopId, cancellationToken);

        var link = await _shopUserRepository.Query()
            .FirstOrDefaultAsync(x => x.UserId == userId && x.ShopId == shopId, cancellationToken)
            ?? throw new AppException("shop_user_not_found", "Shop user assignment not found.", 404);

        link.IsActive = isActive;
        link.ModifiedOn = DateTimeOffset.UtcNow;
        link.ModifiedBy = _currentUserService.UserId;
        _shopUserRepository.Update(link);

        var user = await _userRepository.GetByIdAsync(userId, cancellationToken)
            ?? throw new AppException("user_not_found", "User not found.", 404);

        user.IsActive = isActive;
        user.ModifiedOn = DateTimeOffset.UtcNow;
        user.ModifiedBy = _currentUserService.UserId;
        _userRepository.Update(user);

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(
            nameof(User),
            user.Id,
            isActive ? "UserReactivated" : "UserDeactivated",
            shopId,
            cancellationToken: cancellationToken);
    }

    private async Task EnsureCanManageShopUsersAsync(Guid shopId, CancellationToken cancellationToken)
    {
        if (!_currentUserService.UserId.HasValue)
        {
            throw new AppException("unauthorized", "User context is missing.", 401);
        }

        if (_currentUserService.IsInRole(RoleNames.PlatformAdmin))
        {
            return;
        }

        var actorId = _currentUserService.UserId.Value;
        var hasManagementRoleForShop = await _shopUserRepository.Query()
            .AsNoTracking()
            .AnyAsync(
                x => x.ShopId == shopId
                     && x.UserId == actorId
                     && x.IsActive
                     && (x.Role.Name == RoleNames.CompanyOwner || x.Role.Name == RoleNames.Manager),
                cancellationToken);

        if (!hasManagementRoleForShop)
        {
            throw new AppException("unauthorized_role", "Only company owner or manager can manage users for this shop.", 403);
        }
    }
}


