using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Auth;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Entities;

namespace ScratchCard.Application.Services;

public class AuthService : IAuthService
{
    private readonly IRepository<User> _userRepository;
    private readonly IRepository<Company> _companyRepository;
    private readonly IRepository<ShopUser> _shopUserRepository;
    private readonly IRepository<Role> _roleRepository;
    private readonly IRepository<Shop> _shopRepository;
    private readonly ICurrentUserService _currentUserService;
    private readonly IPasswordHashService _passwordHashService;
    private readonly IJwtTokenService _jwtTokenService;
    private readonly IInvitationTokenService _tokenService;
    private readonly IEmailSender _emailSender;
    private readonly IAuditService _auditService;
    private readonly IUnitOfWork _unitOfWork;

    public AuthService(
        IRepository<User> userRepository,
        IRepository<Company> companyRepository,
        IRepository<ShopUser> shopUserRepository,
        IRepository<Role> roleRepository,
        IRepository<Shop> shopRepository,
        ICurrentUserService currentUserService,
        IPasswordHashService passwordHashService,
        IJwtTokenService jwtTokenService,
        IInvitationTokenService tokenService,
        IEmailSender emailSender,
        IAuditService auditService,
        IUnitOfWork unitOfWork)
    {
        _userRepository = userRepository;
        _companyRepository = companyRepository;
        _shopUserRepository = shopUserRepository;
        _roleRepository = roleRepository;
        _shopRepository = shopRepository;
        _currentUserService = currentUserService;
        _passwordHashService = passwordHashService;
        _jwtTokenService = jwtTokenService;
        _tokenService = tokenService;
        _emailSender = emailSender;
        _auditService = auditService;
        _unitOfWork = unitOfWork;
    }

    public async Task<AuthTokenResponseDto> SignUpWithPasswordAsync(PasswordSignupRequest request, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.Email))
        {
            throw new AppException("validation_failed", "Email is required.", 400);
        }

        if (string.IsNullOrWhiteSpace(request.Password) || request.Password.Length < 8)
        {
            throw new AppException("validation_failed", "Password must be at least 8 characters.", 400);
        }

        var normalizedEmail = request.Email.Trim().ToLowerInvariant();
        var existingUser = await _userRepository.Query()
            .AsNoTracking()
            .AnyAsync(x => x.Email == normalizedEmail, cancellationToken);

        if (existingUser)
        {
            throw new AppException("email_already_registered", "A user with this email already exists.", 409);
        }

        var (firstName, lastName) = ResolveUserName(normalizedEmail, request.FirstName, request.LastName);
        var now = DateTimeOffset.UtcNow;
        var user = new User
        {
            Email = normalizedEmail,
            FirstName = firstName,
            LastName = lastName,
            ExternalProvider = "DirectSignup",
            ExternalProviderUserId = $"direct-{Guid.NewGuid():N}",
            PasswordHash = _passwordHashService.HashPassword(request.Password),
            IsActive = true,
            LastLoginOn = now,
            CreatedOn = now
        };

        await _userRepository.AddAsync(user, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        var profile = await BuildProfileAsync(user, Array.Empty<string>(), cancellationToken);
        var token = _jwtTokenService.CreateToken(user, Array.Empty<string>());
        token.Profile = profile;

        await _auditService.LogAsync(nameof(User), user.Id, "UserSignedUp", newValue: normalizedEmail, cancellationToken: cancellationToken);
        return token;
    }

    public async Task<AuthTokenResponseDto> SignInWithPasswordAsync(PasswordLoginRequest request, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.Email))
        {
            throw new AppException("validation_failed", "Email is required.", 400);
        }

        if (string.IsNullOrWhiteSpace(request.Password))
        {
            throw new AppException("validation_failed", "Password is required.", 400);
        }

        var normalizedEmail = request.Email.Trim().ToLowerInvariant();

        var user = await _userRepository.Query()
            .FirstOrDefaultAsync(x => x.Email == normalizedEmail, cancellationToken);

        if (user is null || string.IsNullOrWhiteSpace(user.PasswordHash))
        {
            await _auditService.LogAsync(nameof(User), null, "FailedLogin", newValue: normalizedEmail, reason: "Invalid credentials", cancellationToken: cancellationToken);
            throw new AppException("invalid_credentials", "Invalid email or password.", 401);
        }

        if (!_passwordHashService.VerifyPassword(user.PasswordHash, request.Password))
        {
            await _auditService.LogAsync(nameof(User), user.Id, "FailedLogin", reason: "Wrong password", cancellationToken: cancellationToken);
            throw new AppException("invalid_credentials", "Invalid email or password.", 401);
        }

        if (!user.IsActive)
        {
            await _auditService.LogAsync(nameof(User), user.Id, "FailedLogin", reason: "Inactive user", cancellationToken: cancellationToken);
            throw new AppException("user_inactive", "User account is inactive.", 403);
        }

        user.LastLoginOn = DateTimeOffset.UtcNow;
        user.ModifiedOn = DateTimeOffset.UtcNow;
        user.ModifiedBy = user.Id;
        _userRepository.Update(user);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        var shopUsers = await _shopUserRepository.Query()
            .AsNoTracking()
            .Where(x => x.UserId == user.Id && x.IsActive)
            .Include(x => x.Role)
            .Include(x => x.Shop)
                .ThenInclude(x => x.Company)
            .ToListAsync(cancellationToken);

        var roles = shopUsers.Select(x => x.Role.Name).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        var profile = await BuildProfileAsync(user, roles, cancellationToken, shopUsers);

        var token = _jwtTokenService.CreateToken(user, roles);
        token.Profile = profile;

        await _auditService.LogAsync(nameof(User), user.Id, "UserLogin", cancellationToken: cancellationToken);

        return token;
    }

    public async Task<AuthTokenResponseDto> SignInDevAsync(DevLoginRequest request, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.Email))
        {
            throw new AppException("validation_failed", "Email is required for dev login.", 400);
        }

        var normalizedEmail = request.Email.Trim().ToLowerInvariant();
        var requestedRole = string.IsNullOrWhiteSpace(request.Role) ? RoleNames.ShopOwner : request.Role.Trim();
        var validRoleName = RoleNames.All.FirstOrDefault(x => x.Equals(requestedRole, StringComparison.OrdinalIgnoreCase));

        if (validRoleName is null)
        {
            throw new AppException("invalid_role", $"Role '{requestedRole}' is not valid.", 400);
        }

        var role = await _roleRepository.Query()
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Name == validRoleName && x.IsActive, cancellationToken)
            ?? throw new AppException("role_not_found", $"Role '{validRoleName}' was not found or is inactive.", 404);

        var activeShops = _shopRepository.Query().Where(x => x.IsActive);
        if (request.ShopId.HasValue)
        {
            activeShops = activeShops.Where(x => x.Id == request.ShopId.Value);
        }

        var shop = await activeShops
            .OrderBy(x => x.ShopName)
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new AppException("shop_not_found", "No active shop is available for dev login.", 404);

        var now = DateTimeOffset.UtcNow;
        var user = await _userRepository.Query()
            .FirstOrDefaultAsync(x => x.Email == normalizedEmail, cancellationToken);

        var (resolvedFirstName, resolvedLastName) = ResolveUserName(normalizedEmail, request.FirstName, request.LastName);

        if (user is null)
        {
            user = new User
            {
                Email = normalizedEmail,
                FirstName = resolvedFirstName,
                LastName = resolvedLastName,
                ExternalProvider = "DevBypass",
                ExternalProviderUserId = $"dev-{Guid.NewGuid():N}",
                IsActive = true,
                LastLoginOn = now,
                CreatedOn = now
            };

            await _userRepository.AddAsync(user, cancellationToken);
        }
        else
        {
            user.IsActive = true;
            user.LastLoginOn = now;
            user.ExternalProvider = "DevBypass";
            user.ExternalProviderUserId = string.IsNullOrWhiteSpace(user.ExternalProviderUserId)
                ? $"dev-{Guid.NewGuid():N}"
                : user.ExternalProviderUserId;
            if (IsNameProvided(request.FirstName, request.LastName))
            {
                user.FirstName = resolvedFirstName;
                user.LastName = resolvedLastName;
            }
            else if (string.IsNullOrWhiteSpace(user.FirstName) && string.IsNullOrWhiteSpace(user.LastName))
            {
                user.FirstName = resolvedFirstName;
                user.LastName = resolvedLastName;
            }
            user.ModifiedOn = now;
            user.ModifiedBy = user.Id;

            _userRepository.Update(user);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        var shopUser = await _shopUserRepository.Query()
            .FirstOrDefaultAsync(x => x.UserId == user.Id && x.ShopId == shop.Id, cancellationToken);

        if (shopUser is null)
        {
            shopUser = new ShopUser
            {
                UserId = user.Id,
                ShopId = shop.Id,
                RoleId = role.Id,
                IsActive = true,
                JoinedOn = now,
                CreatedOn = now,
                CreatedBy = user.Id
            };

            await _shopUserRepository.AddAsync(shopUser, cancellationToken);
        }
        else
        {
            shopUser.RoleId = role.Id;
            shopUser.IsActive = true;
            shopUser.ModifiedOn = now;
            shopUser.ModifiedBy = user.Id;

            _shopUserRepository.Update(shopUser);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        var activeShopUsers = await _shopUserRepository.Query()
            .AsNoTracking()
            .Where(x => x.UserId == user.Id && x.IsActive)
            .Include(x => x.Role)
            .Include(x => x.Shop)
                .ThenInclude(x => x.Company)
            .ToListAsync(cancellationToken);

        var roles = activeShopUsers
            .Select(x => x.Role.Name)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        var profile = await BuildProfileAsync(user, roles, cancellationToken, activeShopUsers);

        var token = _jwtTokenService.CreateToken(user, roles);
        token.Profile = profile;

        await _auditService.LogAsync(
            nameof(User),
            user.Id,
            "UserLoginDevBypass",
            shopId: shop.Id,
            reason: $"Role={validRoleName}",
            cancellationToken: cancellationToken);

        return token;
    }

    public async Task RequestPasswordResetAsync(ForgotPasswordRequest request, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.Email))
        {
            throw new AppException("validation_failed", "Email is required.", 400);
        }

        var normalizedEmail = request.Email.Trim().ToLowerInvariant();

        var user = await _userRepository.Query()
            .FirstOrDefaultAsync(x => x.Email == normalizedEmail, cancellationToken);

        if (user is null || !user.IsActive || string.IsNullOrWhiteSpace(user.PasswordHash))
        {
            await _auditService.LogAsync(
                nameof(User),
                user?.Id,
                "PasswordResetRequested",
                newValue: normalizedEmail,
                reason: "No eligible account found",
                cancellationToken: cancellationToken);
            return;
        }

        var (token, tokenHash) = _tokenService.GenerateInvitationToken();
        var expiresOn = DateTimeOffset.UtcNow.AddHours(2);

        user.PasswordResetTokenHash = tokenHash;
        user.PasswordResetTokenExpiresOn = expiresOn;
        user.ModifiedOn = DateTimeOffset.UtcNow;
        user.ModifiedBy = user.Id;

        _userRepository.Update(user);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        var escapedToken = Uri.EscapeDataString(token);
        var resetLink = $"scratchcard://reset-password?token={escapedToken}";
        var body =
            "We received a request to reset your Ops Arrow password.\n\n" +
            $"Reset link: {resetLink}\n\n" +
            $"If the app does not open, enter this token manually in the reset screen:\n{token}\n\n" +
            $"This token expires at {expiresOn:yyyy-MM-dd HH:mm} UTC.\n" +
            "If you did not request this, you can ignore this email.";

        await _emailSender.SendAsync(
            normalizedEmail,
            "Ops Arrow Password Reset",
            body,
            cancellationToken);

        await _auditService.LogAsync(
            nameof(User),
            user.Id,
            "PasswordResetRequested",
            newValue: normalizedEmail,
            cancellationToken: cancellationToken);
    }

    public async Task ResetPasswordAsync(ResetPasswordRequest request, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.Token))
        {
            throw new AppException("validation_failed", "Reset token is required.", 400);
        }

        if (string.IsNullOrWhiteSpace(request.NewPassword) || request.NewPassword.Length < 8)
        {
            throw new AppException("validation_failed", "Password must be at least 8 characters.", 400);
        }

        var tokenHash = _tokenService.ComputeHash(request.Token.Trim());
        var user = await _userRepository.Query()
            .FirstOrDefaultAsync(x => x.PasswordResetTokenHash == tokenHash, cancellationToken)
            ?? throw new AppException("invalid_reset_token", "Reset token is invalid or expired.", 400);

        var now = DateTimeOffset.UtcNow;
        if (!user.PasswordResetTokenExpiresOn.HasValue || user.PasswordResetTokenExpiresOn.Value <= now)
        {
            user.PasswordResetTokenHash = null;
            user.PasswordResetTokenExpiresOn = null;
            user.ModifiedOn = now;
            user.ModifiedBy = user.Id;
            _userRepository.Update(user);
            await _unitOfWork.SaveChangesAsync(cancellationToken);

            throw new AppException("invalid_reset_token", "Reset token is invalid or expired.", 400);
        }

        user.PasswordHash = _passwordHashService.HashPassword(request.NewPassword);
        user.PasswordResetTokenHash = null;
        user.PasswordResetTokenExpiresOn = null;
        user.ModifiedOn = now;
        user.ModifiedBy = user.Id;

        _userRepository.Update(user);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(
            nameof(User),
            user.Id,
            "PasswordResetCompleted",
            cancellationToken: cancellationToken);
    }

    public async Task<AuthTokenResponseDto> RefreshTokenAsync(CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(_currentUserService.Email))
        {
            throw new AppException("unauthorized", "Authenticated user email is missing.", 401);
        }

        var user = await _userRepository.Query()
            .FirstOrDefaultAsync(x => x.Email == _currentUserService.Email && x.IsActive, cancellationToken)
            ?? throw new AppException("user_not_found", "User profile not found.", 404);

        var shopUsers = await _shopUserRepository.Query()
            .AsNoTracking()
            .Where(x => x.UserId == user.Id && x.IsActive)
            .Include(x => x.Role)
            .Include(x => x.Shop)
                .ThenInclude(x => x.Company)
            .ToListAsync(cancellationToken);

        var roles = shopUsers
            .Select(x => x.Role.Name)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        var profile = await BuildProfileAsync(user, roles, cancellationToken, shopUsers);
        var token = _jwtTokenService.CreateToken(user, roles);
        token.Profile = profile;

        await _auditService.LogAsync(nameof(User), user.Id, "UserTokenRefreshed", cancellationToken: cancellationToken);
        return token;
    }

    public async Task<CurrentUserProfileDto> GetCurrentUserProfileAsync(CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(_currentUserService.Email))
        {
            throw new AppException("unauthorized", "Authenticated user email is missing.", 401);
        }

        var user = await _userRepository.Query()
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Email == _currentUserService.Email && x.IsActive, cancellationToken);

        if (user is null)
        {
            throw new AppException("user_not_found", "User profile not found.", 404);
        }

        var shops = await _shopUserRepository.Query()
            .AsNoTracking()
            .Where(x => x.UserId == user.Id && x.IsActive)
            .Include(x => x.Shop)
                .ThenInclude(x => x.Company)
            .Include(x => x.Role)
            .Select(x => new UserShopDto
            {
                ShopId = x.ShopId,
                CompanyId = x.Shop.CompanyId,
                CompanyName = x.Shop.Company != null ? x.Shop.Company.CompanyName : null,
                ShopName = x.Shop.ShopName,
                Role = x.Role.Name
            })
            .ToListAsync(cancellationToken);

        var ownedCompanyIds = await _companyRepository.Query()
            .AsNoTracking()
            .Where(x => !x.IsDeleted && x.OwnerUserId == user.Id)
            .Select(x => x.Id)
            .ToListAsync(cancellationToken);
        var companyIdsFromShops = shops
            .Where(x => x.CompanyId.HasValue)
            .Select(x => x.CompanyId!.Value)
            .Distinct()
            .ToList();
        var primaryCompanyId = ownedCompanyIds.FirstOrDefault();
        if (primaryCompanyId == Guid.Empty)
        {
            primaryCompanyId = companyIdsFromShops.FirstOrDefault();
        }

        return new CurrentUserProfileDto
        {
            UserId = user.Id,
            Email = user.Email,
            FirstName = user.FirstName,
            LastName = user.LastName,
            Roles = _currentUserService.Roles,
            Shops = shops,
            HasCompanySetup = ownedCompanyIds.Count > 0 || companyIdsFromShops.Count > 0,
            HasShopSetup = shops.Count > 0,
            PrimaryCompanyId = primaryCompanyId == Guid.Empty ? null : primaryCompanyId
        };
    }

    private async Task<CurrentUserProfileDto> BuildProfileAsync(
        User user,
        IReadOnlyCollection<string> roles,
        CancellationToken cancellationToken,
        IReadOnlyCollection<ShopUser>? preloadedShopUsers = null)
    {
        var shopUsers = preloadedShopUsers?.ToList() ?? await _shopUserRepository.Query()
            .AsNoTracking()
            .Where(x => x.UserId == user.Id && x.IsActive)
            .Include(x => x.Role)
            .Include(x => x.Shop)
                .ThenInclude(x => x.Company)
            .ToListAsync(cancellationToken);

        var shops = shopUsers
            .Select(x => new UserShopDto
            {
                ShopId = x.ShopId,
                CompanyId = x.Shop.CompanyId,
                CompanyName = x.Shop.Company?.CompanyName,
                ShopName = x.Shop.ShopName,
                Role = x.Role.Name
            })
            .ToArray();

        var ownedCompanyIds = await _companyRepository.Query()
            .AsNoTracking()
            .Where(x => !x.IsDeleted && x.OwnerUserId == user.Id)
            .Select(x => x.Id)
            .ToListAsync(cancellationToken);
        var companyIdsFromShops = shops
            .Where(x => x.CompanyId.HasValue)
            .Select(x => x.CompanyId!.Value)
            .Distinct()
            .ToList();

        var primaryCompanyId = ownedCompanyIds.FirstOrDefault();
        if (primaryCompanyId == Guid.Empty)
        {
            primaryCompanyId = companyIdsFromShops.FirstOrDefault();
        }

        return new CurrentUserProfileDto
        {
            UserId = user.Id,
            Email = user.Email,
            FirstName = user.FirstName,
            LastName = user.LastName,
            Roles = roles,
            Shops = shops,
            HasCompanySetup = ownedCompanyIds.Count > 0 || companyIdsFromShops.Count > 0,
            HasShopSetup = shops.Length > 0,
            PrimaryCompanyId = primaryCompanyId == Guid.Empty ? null : primaryCompanyId
        };
    }

    private static bool IsNameProvided(string? firstName, string? lastName)
    {
        return !string.IsNullOrWhiteSpace(firstName) || !string.IsNullOrWhiteSpace(lastName);
    }

    private static (string FirstName, string LastName) ResolveUserName(string normalizedEmail, string? requestedFirstName, string? requestedLastName)
    {
        var firstName = requestedFirstName?.Trim() ?? string.Empty;
        var lastName = requestedLastName?.Trim() ?? string.Empty;
        if (!string.IsNullOrWhiteSpace(firstName) || !string.IsNullOrWhiteSpace(lastName))
        {
            if (string.IsNullOrWhiteSpace(firstName))
            {
                var fallbackFromEmail = normalizedEmail.Split('@', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault();
                firstName = string.IsNullOrWhiteSpace(fallbackFromEmail) ? "User" : fallbackFromEmail;
            }
            return (firstName, lastName);
        }

        var emailPrefix = normalizedEmail.Split('@', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault();
        return (string.IsNullOrWhiteSpace(emailPrefix) ? "User" : emailPrefix, string.Empty);
    }
}
