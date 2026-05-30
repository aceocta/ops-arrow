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
                PhoneNumber = x.User.PhoneNumber,
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

    public async Task<UserDto> UpdateMyProfileAsync(UpdateUserProfileRequest request, CancellationToken cancellationToken = default)
    {
        if (!_currentUserService.UserId.HasValue)
        {
            throw new AppException("unauthorized", "User context is missing.", 401);
        }

        var user = await _userRepository.GetByIdAsync(_currentUserService.UserId.Value, cancellationToken)
            ?? throw new AppException("user_not_found", "User not found.", 404);

        if (request.FirstName is not null)
        {
            var trimmed = request.FirstName.Trim();
            if (trimmed.Length > 0) user.FirstName = trimmed;
        }
        if (request.LastName is not null)
        {
            var trimmed = request.LastName.Trim();
            if (trimmed.Length > 0) user.LastName = trimmed;
        }
        if (request.PhoneNumber is not null)
        {
            // Empty string clears the saved phone; whitespace is treated as clear too.
            var trimmed = request.PhoneNumber.Trim();
            user.PhoneNumber = trimmed.Length == 0 ? null : trimmed;
        }

        user.ModifiedOn = DateTimeOffset.UtcNow;
        user.ModifiedBy = user.Id;
        _userRepository.Update(user);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return new UserDto
        {
            Id = user.Id,
            Email = user.Email,
            FirstName = user.FirstName,
            LastName = user.LastName,
            PhoneNumber = user.PhoneNumber,
            IsActive = user.IsActive,
            LastLoginOn = user.LastLoginOn,
            RoleName = string.Empty,
        };
    }

    public async Task<UserDto> UpdateUserDetailsAsync(Guid userId, Guid shopId, UpdateUserProfileRequest request, CancellationToken cancellationToken = default)
    {
        await EnsureCanManageShopUsersAsync(shopId, cancellationToken);

        // Sanity-check that the target user actually belongs to the shop the manager admins.
        // Without this, a manager on Shop A could update someone on Shop B by guessing the id.
        var assignmentExists = await _shopUserRepository.Query()
            .AsNoTracking()
            .AnyAsync(x => x.UserId == userId && x.ShopId == shopId, cancellationToken);
        if (!assignmentExists)
        {
            throw new AppException("shop_user_not_found", "Shop user assignment not found.", 404);
        }

        var user = await _userRepository.GetByIdAsync(userId, cancellationToken)
            ?? throw new AppException("user_not_found", "User not found.", 404);

        var changes = new List<string>();

        if (request.FirstName is not null)
        {
            var trimmed = request.FirstName.Trim();
            if (trimmed.Length > 0 && !string.Equals(user.FirstName, trimmed, StringComparison.Ordinal))
            {
                changes.Add($"firstName '{user.FirstName}' -> '{trimmed}'");
                user.FirstName = trimmed;
            }
        }
        if (request.LastName is not null)
        {
            var trimmed = request.LastName.Trim();
            if (trimmed.Length > 0 && !string.Equals(user.LastName, trimmed, StringComparison.Ordinal))
            {
                changes.Add($"lastName '{user.LastName}' -> '{trimmed}'");
                user.LastName = trimmed;
            }
        }
        if (request.PhoneNumber is not null)
        {
            // Empty string clears the saved phone; whitespace is treated as clear too.
            var trimmed = request.PhoneNumber.Trim();
            var nextPhone = trimmed.Length == 0 ? null : trimmed;
            if (!string.Equals(user.PhoneNumber, nextPhone, StringComparison.Ordinal))
            {
                changes.Add($"phoneNumber '{user.PhoneNumber ?? "<null>"}' -> '{nextPhone ?? "<null>"}'");
                user.PhoneNumber = nextPhone;
            }
        }

        if (changes.Count > 0)
        {
            user.ModifiedOn = DateTimeOffset.UtcNow;
            user.ModifiedBy = _currentUserService.UserId;
            _userRepository.Update(user);
            await _unitOfWork.SaveChangesAsync(cancellationToken);

            await _auditService.LogAsync(
                nameof(User),
                user.Id,
                "UserDetailsUpdated",
                shopId,
                newValue: string.Join("; ", changes),
                cancellationToken: cancellationToken);
        }

        return new UserDto
        {
            Id = user.Id,
            Email = user.Email,
            FirstName = user.FirstName,
            LastName = user.LastName,
            PhoneNumber = user.PhoneNumber,
            IsActive = user.IsActive,
            LastLoginOn = user.LastLoginOn,
            RoleName = string.Empty,
        };
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


