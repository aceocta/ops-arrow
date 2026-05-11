using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Auth;
using ScratchCard.Application.DTOs.Companies;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Entities;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.Services;

public class CompanySignupService : ICompanySignupService
{
    private readonly IRepository<User> _userRepository;
    private readonly IRepository<Role> _roleRepository;
    private readonly IRepository<Company> _companyRepository;
    private readonly IRepository<Shop> _shopRepository;
    private readonly IRepository<ShopUser> _shopUserRepository;
    private readonly IRepository<SubscriptionPlan> _subscriptionPlanRepository;
    private readonly IRepository<CompanySubscription> _companySubscriptionRepository;
    private readonly IRepository<AppConfiguration> _configurationRepository;
    private readonly IRepository<BillingEvent> _billingEventRepository;
    private readonly IPasswordHashService _passwordHashService;
    private readonly IJwtTokenService _jwtTokenService;
    private readonly IAuditService _auditService;
    private readonly IUnitOfWork _unitOfWork;

    public CompanySignupService(
        IRepository<User> userRepository,
        IRepository<Role> roleRepository,
        IRepository<Company> companyRepository,
        IRepository<Shop> shopRepository,
        IRepository<ShopUser> shopUserRepository,
        IRepository<SubscriptionPlan> subscriptionPlanRepository,
        IRepository<CompanySubscription> companySubscriptionRepository,
        IRepository<AppConfiguration> configurationRepository,
        IRepository<BillingEvent> billingEventRepository,
        IPasswordHashService passwordHashService,
        IJwtTokenService jwtTokenService,
        IAuditService auditService,
        IUnitOfWork unitOfWork)
    {
        _userRepository = userRepository;
        _roleRepository = roleRepository;
        _companyRepository = companyRepository;
        _shopRepository = shopRepository;
        _shopUserRepository = shopUserRepository;
        _subscriptionPlanRepository = subscriptionPlanRepository;
        _companySubscriptionRepository = companySubscriptionRepository;
        _configurationRepository = configurationRepository;
        _billingEventRepository = billingEventRepository;
        _passwordHashService = passwordHashService;
        _jwtTokenService = jwtTokenService;
        _auditService = auditService;
        _unitOfWork = unitOfWork;
    }

    public async Task<AuthTokenResponseDto> SignUpAsync(CompanySignupRequest request, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.CompanyName))
        {
            throw new AppException("validation_failed", "Company name is required.", 400);
        }

        if (string.IsNullOrWhiteSpace(request.OwnerEmail))
        {
            throw new AppException("validation_failed", "Owner email is required.", 400);
        }

        if (string.IsNullOrWhiteSpace(request.OwnerFirstName))
        {
            throw new AppException("validation_failed", "Owner first name is required.", 400);
        }

        if (string.IsNullOrWhiteSpace(request.OwnerLastName))
        {
            throw new AppException("validation_failed", "Owner last name is required.", 400);
        }

        if (string.IsNullOrWhiteSpace(request.FirstShopName))
        {
            throw new AppException("validation_failed", "Shop name is required.", 400);
        }

        if (string.IsNullOrWhiteSpace(request.AddressLine1))
        {
            throw new AppException("validation_failed", "Address line 1 is required.", 400);
        }

        if (string.IsNullOrWhiteSpace(request.City))
        {
            throw new AppException("validation_failed", "City is required.", 400);
        }

        if (string.IsNullOrWhiteSpace(request.PostCode))
        {
            throw new AppException("validation_failed", "Post code is required.", 400);
        }

        if (string.IsNullOrWhiteSpace(request.Password) || request.Password.Length < 8)
        {
            throw new AppException("validation_failed", "Password must be at least 8 characters.", 400);
        }

        var normalizedOwnerEmail = request.OwnerEmail.Trim().ToLowerInvariant();
        var companyName = request.CompanyName.Trim();
        var duplicateName = await _companyRepository.Query()
            .AsNoTracking()
            .AnyAsync(x => x.CompanyName == companyName && !x.IsDeleted, cancellationToken);

        if (duplicateName)
        {
            throw new AppException("duplicate_company_name", "A company with the same name already exists.", 409);
        }

        var existingCompanyForEmail = await _companyRepository.Query()
            .AsNoTracking()
            .AnyAsync(x => x.Email == normalizedOwnerEmail && !x.IsDeleted, cancellationToken);

        if (existingCompanyForEmail)
        {
            throw new AppException("owner_company_exists", "This owner email is already linked to a company account.", 409);
        }

        var now = DateTimeOffset.UtcNow;
        var user = await _userRepository.Query()
            .FirstOrDefaultAsync(x => x.Email == normalizedOwnerEmail, cancellationToken);

        if (user is null)
        {
            user = new User
            {
                Email = normalizedOwnerEmail,
                FirstName = request.OwnerFirstName.Trim(),
                LastName = request.OwnerLastName.Trim(),
                ExternalProvider = "DirectSignup",
                ExternalProviderUserId = $"direct-{Guid.NewGuid():N}",
                PasswordHash = _passwordHashService.HashPassword(request.Password),
                IsActive = true,
                LastLoginOn = now,
                CreatedOn = now
            };

            await _userRepository.AddAsync(user, cancellationToken);
            await _unitOfWork.SaveChangesAsync(cancellationToken);
        }
        else
        {
            user.FirstName = request.OwnerFirstName.Trim();
            user.LastName = request.OwnerLastName.Trim();
            user.ExternalProvider = string.IsNullOrWhiteSpace(user.ExternalProvider) ? "DirectSignup" : user.ExternalProvider;
            user.ExternalProviderUserId = string.IsNullOrWhiteSpace(user.ExternalProviderUserId)
                ? $"direct-{Guid.NewGuid():N}"
                : user.ExternalProviderUserId;
            user.PasswordHash = _passwordHashService.HashPassword(request.Password);
            user.IsActive = true;
            user.LastLoginOn = now;
            user.ModifiedOn = now;
            user.ModifiedBy = user.Id;
            _userRepository.Update(user);
            await _unitOfWork.SaveChangesAsync(cancellationToken);
        }

        var existingOwnedCompany = await _companyRepository.Query()
            .AsNoTracking()
            .AnyAsync(x => x.OwnerUserId == user.Id && !x.IsDeleted, cancellationToken);

        if (existingOwnedCompany)
        {
            throw new AppException("owner_company_exists", "This owner already has a company account.", 409);
        }

        var company = new Company
        {
            CompanyName = companyName,
            OwnerUserId = user.Id,
            Email = normalizedOwnerEmail,
            PhoneNumber = string.IsNullOrWhiteSpace(request.PhoneNumber) ? null : request.PhoneNumber.Trim(),
            AddressLine1 = string.IsNullOrWhiteSpace(request.AddressLine1) ? null : request.AddressLine1.Trim(),
            AddressLine2 = string.IsNullOrWhiteSpace(request.AddressLine2) ? null : request.AddressLine2.Trim(),
            City = string.IsNullOrWhiteSpace(request.City) ? null : request.City.Trim(),
            PostCode = string.IsNullOrWhiteSpace(request.PostCode) ? null : request.PostCode.Trim(),
            Country = string.IsNullOrWhiteSpace(request.Country) ? "UK" : request.Country.Trim(),
            Status = CompanyStatus.Active,
            IsActive = true,
            IsDeleted = false,
            CreatedOn = now,
            CreatedBy = user.Id
        };

        await _companyRepository.AddAsync(company, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        var firstShop = new Shop
        {
            CompanyId = company.Id,
            ShopName = request.FirstShopName!.Trim(),
            AddressLine1 = company.AddressLine1!,
            AddressLine2 = company.AddressLine2,
            City = company.City!,
            PostCode = company.PostCode!,
            Country = company.Country,
            IsActive = true,
            IsDeleted = false,
            CreatedOn = now,
            CreatedBy = user.Id
        };

        await _shopRepository.AddAsync(firstShop, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        var shopOwnerRole = await _roleRepository.Query()
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Name == RoleNames.ShopOwner && x.IsActive, cancellationToken)
            ?? throw new AppException("role_not_found", "ShopOwner role not found.", 404);

        await _shopUserRepository.AddAsync(new ShopUser
        {
            ShopId = firstShop.Id,
            UserId = user.Id,
            RoleId = shopOwnerRole.Id,
            IsActive = true,
            JoinedOn = now,
            CreatedOn = now,
            CreatedBy = user.Id
        }, cancellationToken);

        var trialPlan = await _subscriptionPlanRepository.Query()
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.BillingCycle == BillingCycle.Trial && x.IsActive, cancellationToken)
            ?? throw new AppException("trial_plan_not_found", "Trial subscription plan is not configured.", 500);

        var trialDays = await ResolveTrialDaysAsync(trialPlan, cancellationToken);
        var trialEndsOn = now.AddDays(trialDays);

        var trialSubscription = new CompanySubscription
        {
            CompanyId = company.Id,
            SubscriptionPlanId = trialPlan.Id,
            Status = SubscriptionStatus.TrialActive,
            BillingCycle = BillingCycle.Trial,
            PricePerShop = 0,
            ActiveShopCount = 1,
            DiscountAmount = 0,
            DiscountPercentage = 0,
            SubTotalAmount = 0,
            TotalAmount = 0,
            TrialStartedOn = now,
            TrialEndsOn = trialEndsOn,
            CurrentPeriodStartedOn = now,
            CurrentPeriodEndsOn = trialEndsOn,
            CancelAtPeriodEnd = false,
            CreatedOn = now,
            CreatedBy = user.Id
        };

        await _companySubscriptionRepository.AddAsync(trialSubscription, cancellationToken);
        await _billingEventRepository.AddAsync(new BillingEvent
        {
            CompanyId = company.Id,
            CompanySubscription = trialSubscription,
            EventType = BillingEventType.TrialStarted,
            Description = $"Trial started for {trialDays} days.",
            NewValue = $"EndsOn={trialEndsOn:O}",
            CreatedOn = now,
            CreatedBy = user.Id
        }, cancellationToken);

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        var profile = new CurrentUserProfileDto
        {
            UserId = user.Id,
            Email = user.Email,
            FirstName = user.FirstName,
            LastName = user.LastName,
            Roles = [RoleNames.ShopOwner],
            Shops =
            [
                new UserShopDto
                {
                    ShopId = firstShop.Id,
                    CompanyId = company.Id,
                    CompanyName = company.CompanyName,
                    ShopName = firstShop.ShopName,
                    Role = RoleNames.ShopOwner
                }
            ],
            HasCompanySetup = true,
            HasShopSetup = true,
            PrimaryCompanyId = company.Id
        };

        var token = _jwtTokenService.CreateToken(user, [RoleNames.ShopOwner]);
        token.Profile = profile;

        await _auditService.LogAsync(
            nameof(Company),
            company.Id,
            "CompanySignedUp",
            shopId: firstShop.Id,
            newValue: company.CompanyName,
            cancellationToken: cancellationToken);

        return token;
    }

    private async Task<int> ResolveTrialDaysAsync(SubscriptionPlan trialPlan, CancellationToken cancellationToken)
    {
        var configuredDaysRaw = await _configurationRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == null && x.ConfigKey == "DefaultTrialDays" && x.IsActive)
            .Select(x => x.ConfigValue)
            .FirstOrDefaultAsync(cancellationToken);

        if (int.TryParse(configuredDaysRaw, out var configuredDays) && configuredDays > 0)
        {
            return configuredDays;
        }

        if (trialPlan.TrialDays > 0)
        {
            return trialPlan.TrialDays;
        }

        return 30;
    }
}
