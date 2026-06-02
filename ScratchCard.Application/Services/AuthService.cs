using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using System.Net;
using System.Net.Mail;
using System.Security.Cryptography;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Models;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Auth;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Entities;

namespace ScratchCard.Application.Services;

public class AuthService : IAuthService
{
    private const string DefaultPasswordResetBaseUrl = "https://wa-ops-arrow-uat-dvdrbjf9fraydwdd.canadacentral-01.azurewebsites.net";
    private const int SignupVerificationCodeLength = 6;
    private static readonly TimeSpan SignupVerificationCodeLifetime = TimeSpan.FromMinutes(10);
    private readonly IRepository<User> _userRepository;
    private readonly IRepository<SignupEmailVerification> _signupEmailVerificationRepository;
    private readonly IRepository<Company> _companyRepository;
    private readonly IRepository<ShopUser> _shopUserRepository;
    private readonly IRepository<UserRole> _userRoleRepository;
    private readonly IRepository<Role> _roleRepository;
    private readonly IRepository<Shop> _shopRepository;
    private readonly ICurrentUserService _currentUserService;
    private readonly IPasswordHashService _passwordHashService;
    private readonly IJwtTokenService _jwtTokenService;
    private readonly IRefreshTokenService _refreshTokenService;
    private readonly IInvitationTokenService _tokenService;
    private readonly IEmailSender _emailSender;
    private readonly IAuditService _auditService;
    private readonly IUnitOfWork _unitOfWork;
    private readonly string _passwordResetBaseUrl;

    public AuthService(
        IRepository<User> userRepository,
        IRepository<SignupEmailVerification> signupEmailVerificationRepository,
        IRepository<Company> companyRepository,
        IRepository<ShopUser> shopUserRepository,
        IRepository<UserRole> userRoleRepository,
        IRepository<Role> roleRepository,
        IRepository<Shop> shopRepository,
        ICurrentUserService currentUserService,
        IPasswordHashService passwordHashService,
        IJwtTokenService jwtTokenService,
        IRefreshTokenService refreshTokenService,
        IInvitationTokenService tokenService,
        IEmailSender emailSender,
        IAuditService auditService,
        IUnitOfWork unitOfWork,
        IConfiguration configuration)
    {
        _userRepository = userRepository;
        _signupEmailVerificationRepository = signupEmailVerificationRepository;
        _companyRepository = companyRepository;
        _shopUserRepository = shopUserRepository;
        _userRoleRepository = userRoleRepository;
        _roleRepository = roleRepository;
        _shopRepository = shopRepository;
        _currentUserService = currentUserService;
        _passwordHashService = passwordHashService;
        _jwtTokenService = jwtTokenService;
        _refreshTokenService = refreshTokenService;
        _tokenService = tokenService;
        _emailSender = emailSender;
        _auditService = auditService;
        _unitOfWork = unitOfWork;
        _passwordResetBaseUrl =
            configuration["Auth:PasswordResetBaseUrl"]?.Trim()
            ?? configuration["PasswordResetBaseUrl"]?.Trim()
            ?? configuration["Invitation:InvitationAcceptBaseUrl"]?.Trim()
            ?? configuration["InvitationAcceptBaseUrl"]?.Trim()
            ?? DefaultPasswordResetBaseUrl;
    }

    public async Task<SignupEmailVerificationResponse> RequestSignupEmailVerificationAsync(SignupEmailVerificationRequest request, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.Email))
        {
            throw new AppException("validation_failed", "Email is required.", 400);
        }

        var normalizedEmail = request.Email.Trim().ToLowerInvariant();
        if (!IsValidEmail(normalizedEmail))
        {
            throw new AppException("validation_failed", "Email format is invalid.", 400);
        }

        var existingUser = await _userRepository.Query()
            .AsNoTracking()
            .AnyAsync(x => x.Email == normalizedEmail, cancellationToken);

        if (existingUser)
        {
            throw new AppException("email_already_registered", "A user with this email already exists.", 409);
        }

        var now = DateTimeOffset.UtcNow;
        var expiresOn = now.Add(SignupVerificationCodeLifetime);
        var code = GenerateNumericVerificationCode(SignupVerificationCodeLength);
        var codeHash = _tokenService.ComputeHash(code);

        var existingVerification = await _signupEmailVerificationRepository.Query()
            .FirstOrDefaultAsync(x => x.Email == normalizedEmail, cancellationToken);

        if (existingVerification is null)
        {
            existingVerification = new SignupEmailVerification
            {
                Email = normalizedEmail,
                CodeHash = codeHash,
                CodeLength = SignupVerificationCodeLength,
                ExpiresOn = expiresOn,
                FailedAttempts = 0,
                LastSentOn = now,
                CreatedOn = now
            };
            await _signupEmailVerificationRepository.AddAsync(existingVerification, cancellationToken);
        }
        else
        {
            existingVerification.CodeHash = codeHash;
            existingVerification.CodeLength = SignupVerificationCodeLength;
            existingVerification.ExpiresOn = expiresOn;
            existingVerification.FailedAttempts = 0;
            existingVerification.LastSentOn = now;
            existingVerification.ModifiedOn = now;
            _signupEmailVerificationRepository.Update(existingVerification);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        var emailMessage = BuildSignupVerificationEmailMessage(normalizedEmail, code, expiresOn);
        await _emailSender.SendAsync(emailMessage, cancellationToken);

        await _auditService.LogAsync(
            nameof(SignupEmailVerification),
            existingVerification.Id,
            "SignupEmailVerificationCodeRequested",
            newValue: normalizedEmail,
            cancellationToken: cancellationToken);

        return new SignupEmailVerificationResponse
        {
            ExpiresOn = expiresOn
        };
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

        if (string.IsNullOrWhiteSpace(request.VerificationCode))
        {
            throw new AppException("validation_failed", "Verification code is required.", 400);
        }

        var normalizedEmail = request.Email.Trim().ToLowerInvariant();
        if (!IsValidEmail(normalizedEmail))
        {
            throw new AppException("validation_failed", "Email format is invalid.", 400);
        }

        var normalizedCode = request.VerificationCode.Trim();
        if (!IsValidVerificationCode(normalizedCode))
        {
            throw new AppException("validation_failed", "Verification code must be a 6 digit number.", 400);
        }

        var existingUser = await _userRepository.Query()
            .AsNoTracking()
            .AnyAsync(x => x.Email == normalizedEmail, cancellationToken);

        if (existingUser)
        {
            throw new AppException("email_already_registered", "A user with this email already exists.", 409);
        }

        var verification = await _signupEmailVerificationRepository.Query()
            .FirstOrDefaultAsync(x => x.Email == normalizedEmail, cancellationToken)
            ?? throw new AppException("verification_required", "Email verification is required before signup.", 400);

        var now = DateTimeOffset.UtcNow;
        if (verification.ExpiresOn <= now)
        {
            _signupEmailVerificationRepository.Remove(verification);
            await _unitOfWork.SaveChangesAsync(cancellationToken);
            throw new AppException("verification_code_expired", "Verification code expired. Request a new code.", 400);
        }

        if (normalizedCode.Length != SignupVerificationCodeLength)
        {
            verification.FailedAttempts += 1;
            verification.ModifiedOn = now;
            _signupEmailVerificationRepository.Update(verification);
            await _unitOfWork.SaveChangesAsync(cancellationToken);
            throw new AppException("invalid_verification_code", "Verification code is invalid.", 400);
        }

        var codeHash = _tokenService.ComputeHash(normalizedCode);
        if (!string.Equals(verification.CodeHash, codeHash, StringComparison.Ordinal))
        {
            verification.FailedAttempts += 1;
            verification.ModifiedOn = now;
            _signupEmailVerificationRepository.Update(verification);
            await _unitOfWork.SaveChangesAsync(cancellationToken);
            throw new AppException("invalid_verification_code", "Verification code is invalid.", 400);
        }

        var (firstName, lastName) = ResolveUserName(normalizedEmail, request.FirstName, request.LastName);
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

        var ownerRole = await _roleRepository.Query()
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Name == RoleNames.CompanyOwner && x.IsActive, cancellationToken)
            ?? throw new AppException("role_not_found", "CompanyOwner role not found.", 404);

        await _userRoleRepository.AddAsync(new UserRole
        {
            UserId = user.Id,
            RoleId = ownerRole.Id,
            IsActive = true,
            AssignedOn = now,
            CreatedOn = now,
            CreatedBy = user.Id
        }, cancellationToken);

        _signupEmailVerificationRepository.Remove(verification);

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        var roles = new[] { RoleNames.CompanyOwner };
        var profile = await BuildProfileAsync(user, roles, cancellationToken);
        var token = await _jwtTokenService.CreateTokenAsync(user, roles, cancellationToken);
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

        var roles = await ResolveEffectiveRoleNamesAsync(user.Id, shopUsers, cancellationToken);
        var profile = await BuildProfileAsync(user, roles, cancellationToken, shopUsers);

        var token = await _jwtTokenService.CreateTokenAsync(user, roles, cancellationToken);
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
        var requestedRole = string.IsNullOrWhiteSpace(request.Role) ? RoleNames.CompanyOwner : request.Role.Trim();
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

        var roles = await ResolveEffectiveRoleNamesAsync(user.Id, activeShopUsers, cancellationToken);

        var profile = await BuildProfileAsync(user, roles, cancellationToken, activeShopUsers);

        var token = await _jwtTokenService.CreateTokenAsync(user, roles, cancellationToken);
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
        var resetDeepLink = $"scratchcard://reset-password?token={escapedToken}";
        var resetOpenLink = BuildPasswordResetOpenLink(token);
        var message = BuildPasswordResetEmailMessage(
            recipient: normalizedEmail,
            resetOpenLink: resetOpenLink,
            resetDeepLink: resetDeepLink,
            resetToken: token,
            expiresOnUtc: expiresOn);

        await _emailSender.SendAsync(message, cancellationToken);

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

        var roles = await ResolveEffectiveRoleNamesAsync(user.Id, shopUsers, cancellationToken);

        var profile = await BuildProfileAsync(user, roles, cancellationToken, shopUsers);
        var token = await _jwtTokenService.CreateTokenAsync(user, roles, cancellationToken);
        token.Profile = profile;

        await _auditService.LogAsync(nameof(User), user.Id, "UserTokenRefreshed", cancellationToken: cancellationToken);
        return token;
    }

    public async Task<AuthTokenResponseDto> RefreshAccessTokenAsync(string refreshToken, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(refreshToken))
        {
            throw new AppException("invalid_refresh_token", "Refresh token is required.", 401);
        }

        var existing = await _refreshTokenService.FindByRawAsync(refreshToken, cancellationToken)
            ?? throw new AppException("invalid_refresh_token", "Refresh token is invalid.", 401);

        var now = DateTimeOffset.UtcNow;

        // Reuse/theft signal: an already-rotated (revoked) token was replayed. Revoke the user's
        // whole active set so a stolen-but-rotated token can't be parlayed into a live session.
        if (existing.RevokedOn is not null)
        {
            await _refreshTokenService.RevokeAllActiveForUserAsync(existing.UserId, cancellationToken);
            throw new AppException("refresh_token_reused", "Refresh token has already been used. Please sign in again.", 401);
        }

        if (existing.ExpiresOn <= now)
        {
            throw new AppException("refresh_token_expired", "Refresh token has expired. Please sign in again.", 401);
        }

        var user = await _userRepository.Query()
            .FirstOrDefaultAsync(x => x.Id == existing.UserId && x.IsActive, cancellationToken)
            ?? throw new AppException("user_not_found", "User profile not found.", 404);

        var shopUsers = await _shopUserRepository.Query()
            .AsNoTracking()
            .Where(x => x.UserId == user.Id && x.IsActive)
            .Include(x => x.Role)
            .Include(x => x.Shop)
                .ThenInclude(x => x.Company)
            .ToListAsync(cancellationToken);

        var roles = await ResolveEffectiveRoleNamesAsync(user.Id, shopUsers, cancellationToken);
        var profile = await BuildProfileAsync(user, roles, cancellationToken, shopUsers);

        // Mints the new access token and a fresh refresh token (rotation).
        var token = await _jwtTokenService.CreateTokenAsync(user, roles, cancellationToken);
        token.Profile = profile;

        // Rotate: revoke the presented token and link it to its successor for chain auditing.
        existing.RevokedOn = now;
        existing.ReplacedByTokenHash = _refreshTokenService.Hash(token.RefreshToken);
        existing.ModifiedOn = now;
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(nameof(User), user.Id, "AccessTokenRefreshed", cancellationToken: cancellationToken);
        return token;
    }

    public async Task RevokeRefreshTokenAsync(string refreshToken, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(refreshToken))
        {
            return;
        }

        var existing = await _refreshTokenService.FindByRawAsync(refreshToken, cancellationToken);
        if (existing is null || existing.RevokedOn is not null)
        {
            // Unknown or already-revoked token — nothing to do (logout is best-effort, idempotent).
            return;
        }

        existing.RevokedOn = DateTimeOffset.UtcNow;
        existing.ModifiedOn = existing.RevokedOn;
        await _unitOfWork.SaveChangesAsync(cancellationToken);
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
                Role = x.Role.Name,
                IsFuelStation = x.Shop.IsFuelStation
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
            PhoneNumber = user.PhoneNumber,
            Roles = await ResolveEffectiveRoleNamesAsync(user.Id, null, cancellationToken),
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
                Role = x.Role.Name,
                IsFuelStation = x.Shop.IsFuelStation
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
            PhoneNumber = user.PhoneNumber,
            Roles = roles,
            Shops = shops,
            HasCompanySetup = ownedCompanyIds.Count > 0 || companyIdsFromShops.Count > 0,
            HasShopSetup = shops.Length > 0,
            PrimaryCompanyId = primaryCompanyId == Guid.Empty ? null : primaryCompanyId
        };
    }

    private async Task<string[]> ResolveEffectiveRoleNamesAsync(
        Guid userId,
        IReadOnlyCollection<ShopUser>? preloadedShopUsers,
        CancellationToken cancellationToken)
    {
        var shopRoleNames = (preloadedShopUsers ?? await _shopUserRepository.Query()
                .AsNoTracking()
                .Where(x => x.UserId == userId && x.IsActive)
                .Include(x => x.Role)
                .ToListAsync(cancellationToken))
            .Select(x => x.Role.Name);

        var directRoleNames = await _userRoleRepository.Query()
            .AsNoTracking()
            .Where(x => x.UserId == userId && x.IsActive && x.Role.IsActive)
            .Select(x => x.Role.Name)
            .ToListAsync(cancellationToken);

        return shopRoleNames
            .Concat(directRoleNames)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
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

    private static bool IsValidEmail(string email)
    {
        return MailAddress.TryCreate(email, out _);
    }

    private static bool IsValidVerificationCode(string code)
    {
        if (code.Length != SignupVerificationCodeLength)
        {
            return false;
        }

        foreach (var ch in code)
        {
            if (!char.IsAsciiDigit(ch))
            {
                return false;
            }
        }

        return true;
    }

    private static string GenerateNumericVerificationCode(int codeLength)
    {
        var chars = new char[codeLength];
        for (var index = 0; index < codeLength; index++)
        {
            chars[index] = (char)('0' + RandomNumberGenerator.GetInt32(0, 10));
        }

        return new string(chars);
    }

    private static EmailMessage BuildSignupVerificationEmailMessage(string recipient, string code, DateTimeOffset expiresOnUtc)
    {
        var safeRecipient = WebUtility.HtmlEncode(recipient);
        var safeCode = WebUtility.HtmlEncode(code);
        var safeExpiry = WebUtility.HtmlEncode(expiresOnUtc.ToString("yyyy-MM-dd HH:mm 'UTC'"));

        var html = """
            <!doctype html>
            <html lang="en">
            <head>
              <meta charset="utf-8" />
              <meta name="viewport" content="width=device-width, initial-scale=1" />
              <title>Ops Arrow Signup Verification</title>
            </head>
            <body style="margin:0;padding:0;background:#f2f6fb;font-family:Arial,'Segoe UI',sans-serif;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f6fb;padding:28px 12px;">
                <tr>
                  <td align="center">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#ffffff;border:1px solid #d9e1ec;border-radius:14px;overflow:hidden;">
                      <tr>
                        <td style="background:linear-gradient(135deg,#0f3d3e,#1f6f7a);padding:26px 24px;color:#ffffff;">
                          <div style="font-size:12px;letter-spacing:0.8px;text-transform:uppercase;opacity:0.9;">Ops Arrow</div>
                          <div style="font-size:24px;line-height:30px;font-weight:700;margin-top:8px;">Verify your email</div>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:24px;">
                          <p style="margin:0 0 12px;color:#2b3f4a;font-size:15px;line-height:22px;">Hello <strong>__RECIPIENT__</strong>,</p>
                          <p style="margin:0 0 18px;color:#4a5f6b;font-size:15px;line-height:22px;">Use this 6-digit verification code to continue creating your account:</p>
                          <p style="margin:0 0 14px;padding:12px 14px;border:1px dashed #b3c0cf;border-radius:8px;color:#0f3d3e;font-size:24px;line-height:26px;letter-spacing:4px;text-align:center;"><strong>__VERIFICATION_CODE__</strong></p>
                          <p style="margin:0;color:#617785;font-size:13px;line-height:20px;">This code expires at <strong>__EXPIRY__</strong>.</p>
                          <p style="margin:16px 0 0;color:#617785;font-size:13px;line-height:20px;">If you did not request this, you can ignore this email.</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </body>
            </html>
            """
            .Replace("__RECIPIENT__", safeRecipient, StringComparison.Ordinal)
            .Replace("__VERIFICATION_CODE__", safeCode, StringComparison.Ordinal)
            .Replace("__EXPIRY__", safeExpiry, StringComparison.Ordinal);

        return new EmailMessage
        {
            Recipient = recipient,
            Subject = "Ops Arrow Signup Verification Code",
            Body = html,
            IsBodyHtml = true
        };
    }

    private string BuildPasswordResetOpenLink(string token)
    {
        var escapedToken = Uri.EscapeDataString(token);
        return $"{_passwordResetBaseUrl.TrimEnd('/')}/api/auth/reset-password?token={escapedToken}";
    }

    private static EmailMessage BuildPasswordResetEmailMessage(
        string recipient,
        string resetOpenLink,
        string resetDeepLink,
        string resetToken,
        DateTimeOffset expiresOnUtc)
    {
        var safeRecipient = WebUtility.HtmlEncode(recipient);
        var safeResetOpenLink = WebUtility.HtmlEncode(resetOpenLink);
        var safeResetDeepLink = WebUtility.HtmlEncode(resetDeepLink);
        var safeResetToken = WebUtility.HtmlEncode(resetToken);
        var safeExpiry = WebUtility.HtmlEncode(expiresOnUtc.ToString("yyyy-MM-dd HH:mm 'UTC'"));

        var html = """
            <!doctype html>
            <html lang="en">
            <head>
              <meta charset="utf-8" />
              <meta name="viewport" content="width=device-width, initial-scale=1" />
              <title>Ops Arrow Password Reset</title>
            </head>
            <body style="margin:0;padding:0;background:#f2f6fb;font-family:Arial,'Segoe UI',sans-serif;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f6fb;padding:28px 12px;">
                <tr>
                  <td align="center">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#ffffff;border:1px solid #d9e1ec;border-radius:14px;overflow:hidden;">
                      <tr>
                        <td style="background:linear-gradient(135deg,#0f3d3e,#1f6f7a);padding:26px 24px;color:#ffffff;">
                          <div style="font-size:12px;letter-spacing:0.8px;text-transform:uppercase;opacity:0.9;">Ops Arrow</div>
                          <div style="font-size:24px;line-height:30px;font-weight:700;margin-top:8px;">Reset your password</div>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:24px;">
                          <p style="margin:0 0 12px;color:#2b3f4a;font-size:15px;line-height:22px;">Hello <strong>__RECIPIENT__</strong>,</p>
                          <p style="margin:0 0 18px;color:#4a5f6b;font-size:15px;line-height:22px;">We received a request to reset your Ops Arrow password.</p>
                          <p style="margin:0 0 20px;color:#4a5f6b;font-size:14px;line-height:21px;">This reset link expires at <strong>__EXPIRY__</strong>.</p>
                          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px;">
                            <tr>
                              <td align="center" bgcolor="#0f3d3e" style="border-radius:10px;">
                                <a href="__RESET_OPEN_LINK__" style="display:inline-block;padding:12px 22px;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;">Open reset screen</a>
                              </td>
                            </tr>
                          </table>
                          <p style="margin:0 0 8px;color:#617785;font-size:13px;line-height:20px;">If the app does not open from the page, tap the Open App button there, or copy this token into the reset screen:</p>
                          <p style="margin:0 0 12px;padding:10px 12px;border:1px dashed #b3c0cf;border-radius:8px;color:#0f3d3e;font-size:13px;line-height:20px;word-break:break-all;"><strong>__RESET_TOKEN__</strong></p>
                          <p style="margin:0 0 8px;color:#617785;font-size:13px;line-height:20px;">Reset link page:</p>
                          <p style="margin:0 0 10px;word-break:break-all;color:#0f3d3e;font-size:13px;line-height:20px;">__RESET_OPEN_LINK__</p>
                          <p style="margin:0 0 8px;color:#617785;font-size:13px;line-height:20px;">App deep link (if needed):</p>
                          <p style="margin:0;word-break:break-all;color:#0f3d3e;font-size:13px;line-height:20px;">__RESET_DEEP_LINK__</p>
                          <p style="margin:18px 0 0;color:#617785;font-size:13px;line-height:20px;">If you did not request this, you can ignore this email.</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </body>
            </html>
            """
            .Replace("__RECIPIENT__", safeRecipient, StringComparison.Ordinal)
            .Replace("__EXPIRY__", safeExpiry, StringComparison.Ordinal)
            .Replace("__RESET_TOKEN__", safeResetToken, StringComparison.Ordinal)
            .Replace("__RESET_OPEN_LINK__", safeResetOpenLink, StringComparison.Ordinal)
            .Replace("__RESET_DEEP_LINK__", safeResetDeepLink, StringComparison.Ordinal);

        return new EmailMessage
        {
            Recipient = recipient,
            Subject = "Ops Arrow Password Reset",
            Body = html,
            IsBodyHtml = true
        };
    }
}


