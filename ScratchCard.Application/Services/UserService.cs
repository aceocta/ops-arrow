using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Users;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Entities;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.Services;

public class UserService : IUserService
{
    private readonly IRepository<ShopUser> _shopUserRepository;
    private readonly IRepository<User> _userRepository;
    private readonly IRepository<Role> _roleRepository;
    private readonly IRepository<Company> _companyRepository;
    private readonly IRepository<ShopSubscription> _shopSubscriptionRepository;
    private readonly IRepository<UserPushToken> _userPushTokenRepository;
    private readonly IRepository<UserInvitation> _userInvitationRepository;
    private readonly IPasswordHashService _passwordHashService;
    private readonly IRefreshTokenService _refreshTokenService;
    private readonly ISecurityStampService _securityStampService;
    private readonly IAuditService _auditService;
    private readonly ICurrentUserService _currentUserService;
    private readonly IUnitOfWork _unitOfWork;

    public UserService(
        IRepository<ShopUser> shopUserRepository,
        IRepository<User> userRepository,
        IRepository<Role> roleRepository,
        IRepository<Company> companyRepository,
        IRepository<ShopSubscription> shopSubscriptionRepository,
        IRepository<UserPushToken> userPushTokenRepository,
        IRepository<UserInvitation> userInvitationRepository,
        IPasswordHashService passwordHashService,
        IRefreshTokenService refreshTokenService,
        ISecurityStampService securityStampService,
        IAuditService auditService,
        ICurrentUserService currentUserService,
        IUnitOfWork unitOfWork)
    {
        _shopUserRepository = shopUserRepository;
        _userRepository = userRepository;
        _roleRepository = roleRepository;
        _companyRepository = companyRepository;
        _shopSubscriptionRepository = shopSubscriptionRepository;
        _userPushTokenRepository = userPushTokenRepository;
        _userInvitationRepository = userInvitationRepository;
        _passwordHashService = passwordHashService;
        _refreshTokenService = refreshTokenService;
        _securityStampService = securityStampService;
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

        // Revoke outstanding access tokens — they were minted with the old role claims.
        await _securityStampService.BumpAsync(userId, cancellationToken);

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

        if (!isActive)
        {
            // Deactivation must revoke live access tokens immediately. Reactivation deliberately
            // does NOT bump — there are no tokens to revoke and the user simply signs in again.
            await _securityStampService.BumpAsync(userId, cancellationToken);
        }

        await _auditService.LogAsync(
            nameof(User),
            user.Id,
            isActive ? "UserReactivated" : "UserDeactivated",
            shopId,
            cancellationToken: cancellationToken);
    }

    public async Task DeleteMyAccountAsync(DeleteMyAccountRequest request, CancellationToken cancellationToken = default)
    {
        if (!_currentUserService.UserId.HasValue)
        {
            throw new AppException("unauthorized", "User context is missing.", 401);
        }

        if (!string.Equals(request.Confirmation, "DELETE", StringComparison.Ordinal))
        {
            throw new AppException("invalid_confirmation", "Type DELETE to confirm account deletion.", 400);
        }

        var userId = _currentUserService.UserId.Value;
        var user = await _userRepository.GetByIdAsync(userId, cancellationToken)
            ?? throw new AppException("user_not_found", "User not found.", 404);

        // Password accounts must re-authenticate; SSO-only accounts (no hash) skip this check.
        if (!string.IsNullOrWhiteSpace(user.PasswordHash))
        {
            if (string.IsNullOrWhiteSpace(request.Password)
                || !_passwordHashService.VerifyPassword(user.PasswordHash, request.Password))
            {
                await _auditService.LogAsync(nameof(User), userId, "AccountDeletionRejected", reason: "Wrong password", cancellationToken: cancellationToken);
                throw new AppException("invalid_password", "The password you entered is incorrect.", 400);
            }
        }

        var now = DateTimeOffset.UtcNow;

        // GUARD: a sole company owner can't delete while the company still has other active
        // members or a live (trial/active/paused) shop subscription — ownership must be
        // transferred or the company wound down first. A sole owner of an empty company may
        // delete; that company is archived (Closed + inactive) below.
        var ownedCompanies = await _companyRepository.Query()
            .Where(x => !x.IsDeleted && x.OwnerUserId == userId)
            .ToListAsync(cancellationToken);

        foreach (var company in ownedCompanies)
        {
            var hasAnotherActiveOwner = await _shopUserRepository.Query()
                .AsNoTracking()
                .AnyAsync(
                    x => x.Shop.CompanyId == company.Id
                         && x.UserId != userId
                         && x.IsActive
                         && x.User.IsActive
                         && x.Role.Name == RoleNames.CompanyOwner,
                    cancellationToken);

            if (hasAnotherActiveOwner)
            {
                // Not the sole owner — someone else can keep running the company.
                continue;
            }

            var hasOtherActiveMembers = await _shopUserRepository.Query()
                .AsNoTracking()
                .AnyAsync(
                    x => x.Shop.CompanyId == company.Id
                         && x.UserId != userId
                         && x.IsActive
                         && x.User.IsActive,
                    cancellationToken);

            var hasLiveSubscription = await _shopSubscriptionRepository.Query()
                .AsNoTracking()
                .AnyAsync(
                    x => x.CompanyId == company.Id
                         && (x.Status == SubscriptionStatus.TrialActive
                             || x.Status == SubscriptionStatus.Active
                             || x.Status == SubscriptionStatus.Suspended),
                    cancellationToken);

            if (hasOtherActiveMembers || hasLiveSubscription)
            {
                throw new AppException(
                    "account_deletion_owner_blocked",
                    "You are the only owner of a company that still has team members or a live subscription. Transfer ownership or close your company first, then try again.",
                    409);
            }

            // Empty company with no live billing — archive it alongside the account.
            company.Status = CompanyStatus.Closed;
            company.IsActive = false;
            company.ModifiedOn = now;
            company.ModifiedBy = userId;
            _companyRepository.Update(company);
        }

        var oldEmail = user.Email;

        // Anonymise in place — rota/timesheet/refusal/visitor/audit records keep referencing
        // this row, but it no longer carries personal data and can never sign in again.
        user.FirstName = "Former";
        user.LastName = "Staff member";
        user.Email = $"deleted-{user.Id}@deleted.invalid";
        user.PhoneNumber = null;
        user.PasswordHash = null;
        user.PasswordResetTokenHash = null;
        user.PasswordResetTokenExpiresOn = null;
        user.ExternalProvider = "Deleted";
        user.ExternalProviderUserId = $"deleted-{user.Id:N}";
        user.IsActive = false;
        user.ModifiedOn = now;
        user.ModifiedBy = userId;
        _userRepository.Update(user);

        // Deactivate (not delete) shop memberships — same semantics as deactivate today, and
        // historical records keep their FK to the membership/user.
        var shopLinks = await _shopUserRepository.Query()
            .Where(x => x.UserId == userId && x.IsActive)
            .ToListAsync(cancellationToken);
        foreach (var link in shopLinks)
        {
            link.IsActive = false;
            link.ModifiedOn = now;
            link.ModifiedBy = userId;
            _shopUserRepository.Update(link);
        }

        // Push tokens are pure device-routing data — hard-delete them.
        var pushTokens = await _userPushTokenRepository.Query()
            .Where(x => x.UserId == userId)
            .ToListAsync(cancellationToken);
        foreach (var token in pushTokens)
        {
            _userPushTokenRepository.Remove(token);
        }

        // Cancel any invitations still pending against the old email address.
        var pendingInvitations = await _userInvitationRepository.Query()
            .Where(x => x.Email == oldEmail && x.Status == InvitationStatus.Pending)
            .ToListAsync(cancellationToken);
        foreach (var invitation in pendingInvitations)
        {
            invitation.Status = InvitationStatus.Cancelled;
            invitation.CancelledOn = now;
            invitation.CancelledByUserId = userId;
            invitation.ModifiedOn = now;
            invitation.ModifiedBy = userId;
            _userInvitationRepository.Update(invitation);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        // Revoke every live refresh token so no session can be resumed (saves internally).
        await _refreshTokenService.RevokeAllActiveForUserAsync(userId, cancellationToken);

        // Bump the security stamp so any still-live access token dies immediately too.
        await _securityStampService.BumpAsync(userId, cancellationToken);

        await _auditService.LogAsync(
            nameof(User),
            userId,
            "AccountDeleted",
            oldValue: oldEmail,
            reason: "Self-service account deletion",
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


