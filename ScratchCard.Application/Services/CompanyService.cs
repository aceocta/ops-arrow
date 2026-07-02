using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Extensions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Companies;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Entities;

namespace ScratchCard.Application.Services;

public class CompanyService : ICompanyService
{
    private readonly IRepository<Company> _companyRepository;
    private readonly IRepository<ShopUser> _shopUserRepository;
    private readonly IRepository<Role> _roleRepository;
    private readonly IRepository<UserRole> _userRoleRepository;
    private readonly IRepository<User> _userRepository;
    private readonly ICurrentUserService _currentUserService;
    private readonly IAuditService _auditService;
    private readonly IEmailSender _emailSender;
    private readonly IMemoryCache _memoryCache;
    private readonly IUnitOfWork _unitOfWork;

    private readonly string _webPortalUrl;

    // Public web host where owners sign in to set up / manage their shop. Matches the host used by the
    // Stripe / Billing URLs (see appsettings). Used only as a last-resort fallback.
    private const string DefaultWebPortalUrl = "https://app.opsarrow.co.uk";

    // One setup email per user+company per window — protects the SMTP sender from tap-spam.
    private static readonly TimeSpan SetupEmailRateLimitWindow = TimeSpan.FromMinutes(10);

    public CompanyService(
        IRepository<Company> companyRepository,
        IRepository<ShopUser> shopUserRepository,
        IRepository<Role> roleRepository,
        IRepository<UserRole> userRoleRepository,
        IRepository<User> userRepository,
        ICurrentUserService currentUserService,
        IAuditService auditService,
        IEmailSender emailSender,
        IMemoryCache memoryCache,
        IUnitOfWork unitOfWork,
        IConfiguration configuration)
    {
        _companyRepository = companyRepository;
        _shopUserRepository = shopUserRepository;
        _roleRepository = roleRepository;
        _userRoleRepository = userRoleRepository;
        _userRepository = userRepository;
        _currentUserService = currentUserService;
        _auditService = auditService;
        _emailSender = emailSender;
        _memoryCache = memoryCache;
        _unitOfWork = unitOfWork;
        _webPortalUrl = ResolveWebPortalUrl(configuration);
    }

    public async Task<CompanyDto> CreateAsync(CreateCompanyRequest request, CancellationToken cancellationToken = default)
    {
        EnsureCompanyWriteAccess();

        if (string.IsNullOrWhiteSpace(request.CompanyName))
        {
            throw new AppException("validation_failed", "Company name is required.", 400);
        }
        if (!_currentUserService.UserId.HasValue)
        {
            throw new AppException("unauthorized", "User context is missing.", 401);
        }

        var companyName = request.CompanyName.Trim();
        var exists = await _companyRepository.Query()
            .AnyAsync(x => x.CompanyName == companyName && !x.IsDeleted, cancellationToken);

        if (exists)
        {
            throw new AppException("duplicate_company_name", "A company with the same name already exists.", 409);
        }

        var normalizedOwnerEmail = NormalizeEmail(_currentUserService.Email);
        if (string.IsNullOrWhiteSpace(normalizedOwnerEmail))
        {
            throw new AppException("validation_failed", "Owner email is required.", 400);
        }

        var ownerAlreadyHasCompany = await _companyRepository.Query()
            .AsNoTracking()
            .AnyAsync(
                x => !x.IsDeleted &&
                     (x.OwnerUserId == _currentUserService.UserId.Value || x.Email == normalizedOwnerEmail),
                cancellationToken);

        if (ownerAlreadyHasCompany)
        {
            throw new AppException("owner_company_exists", "This owner email is already linked to a company account.", 409);
        }

        var company = new Company
        {
            CompanyName = companyName,
            RegistrationNumber = string.IsNullOrWhiteSpace(request.RegistrationNumber) ? null : request.RegistrationNumber.Trim(),
            OwnerUserId = _currentUserService.UserId.Value,
            Email = normalizedOwnerEmail,
            Country = "UK",
            Status = Domain.Enums.CompanyStatus.Active,
            IsActive = true,
            IsDeleted = false,
            CreatedOn = DateTimeOffset.UtcNow,
            CreatedBy = _currentUserService.UserId
        };

        await _companyRepository.AddAsync(company, cancellationToken);
        await EnsureCompanyOwnerRoleAssignedAsync(_currentUserService.UserId.Value, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(nameof(Company), company.Id, "CompanyCreated", cancellationToken: cancellationToken);
        return company.ToDto();
    }

    public async Task<CompanyDto> UpdateAsync(Guid id, UpdateCompanyRequest request, CancellationToken cancellationToken = default)
    {
        EnsureCompanyWriteAccess();
        await EnsureCompanyAccessAsync(id, cancellationToken);

        var company = await _companyRepository.GetByIdAsync(id, cancellationToken)
            ?? throw new AppException("company_not_found", "Company not found.", 404);
        if (company.IsDeleted)
        {
            throw new AppException("company_not_found", "Company not found.", 404);
        }

        var companyName = request.CompanyName.Trim();
        var duplicateName = await _companyRepository.Query()
            .AsNoTracking()
            .AnyAsync(x => x.Id != id && x.CompanyName == companyName && !x.IsDeleted, cancellationToken);

        if (duplicateName)
        {
            throw new AppException("duplicate_company_name", "A company with the same name already exists.", 409);
        }

        company.CompanyName = companyName;
        company.RegistrationNumber = string.IsNullOrWhiteSpace(request.RegistrationNumber) ? null : request.RegistrationNumber.Trim();
        company.IsActive = request.IsActive;
        company.Status = request.IsActive ? Domain.Enums.CompanyStatus.Active : Domain.Enums.CompanyStatus.Suspended;
        company.ModifiedOn = DateTimeOffset.UtcNow;
        company.ModifiedBy = _currentUserService.UserId;

        _companyRepository.Update(company);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(nameof(Company), company.Id, "CompanyUpdated", cancellationToken: cancellationToken);
        return company.ToDto();
    }

    public async Task<CompanyDto> GetAsync(Guid id, CancellationToken cancellationToken = default)
    {
        await EnsureCompanyAccessAsync(id, cancellationToken);

        var company = await _companyRepository.GetByIdAsync(id, cancellationToken)
            ?? throw new AppException("company_not_found", "Company not found.", 404);
        if (company.IsDeleted)
        {
            throw new AppException("company_not_found", "Company not found.", 404);
        }

        return company.ToDto();
    }

    public async Task<IReadOnlyCollection<CompanyDto>> ListMineAsync(CancellationToken cancellationToken = default)
    {
        if (_currentUserService.UserId is null)
        {
            throw new AppException("unauthorized", "User context is missing.", 401);
        }

        var userId = _currentUserService.UserId.Value;
        var companyIds = await _shopUserRepository.Query()
            .AsNoTracking()
            .Where(x => x.UserId == userId && x.IsActive && x.Shop.CompanyId != null)
            .Select(x => x.Shop.CompanyId!.Value)
            .Distinct()
            .ToListAsync(cancellationToken);

        var companies = await _companyRepository.Query()
            .AsNoTracking()
            .Where(x => !x.IsDeleted && (companyIds.Contains(x.Id) || x.OwnerUserId == userId))
            .OrderBy(x => x.CompanyName)
            .ToListAsync(cancellationToken);

        return companies.Select(x => x.ToDto()).ToArray();
    }

    public async Task SendSetupInfoEmailAsync(Guid companyId, CancellationToken cancellationToken = default)
    {
        if (companyId == Guid.Empty)
        {
            throw new AppException("validation_failed", "CompanyId is required.", 400);
        }

        var userId = _currentUserService.UserId
            ?? throw new AppException("unauthorized", "User context is missing.", 401);

        // Owner (or a company member) only — PlatformAdmin bypasses inside the access check.
        await EnsureCompanyAccessAsync(companyId, cancellationToken);

        // One setup email per user+company per window — protects the SMTP sender from tap-spam.
        var rateLimitKey = $"company-setup-email:{userId:N}:{companyId:N}";
        if (_memoryCache.TryGetValue(rateLimitKey, out _))
        {
            throw new AppException(
                "rate_limited",
                "An email was sent recently. Please wait a few minutes before requesting another.",
                429);
        }

        var company = await _companyRepository.GetByIdAsync(companyId, cancellationToken);
        if (company is null || company.IsDeleted)
        {
            throw new AppException("company_not_found", "Company not found.", 404);
        }

        var user = await _userRepository.Query()
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == userId, cancellationToken);

        var recipient = user?.Email ?? _currentUserService.Email;
        if (string.IsNullOrWhiteSpace(recipient))
        {
            throw new AppException("email_missing", "No email address is on file for your account.", 400);
        }

        var firstName = _currentUserService.FirstName;
        var greeting = string.IsNullOrWhiteSpace(firstName) ? "Hi," : $"Hi {firstName.Trim()},";
        var registrationLine = string.IsNullOrWhiteSpace(company.RegistrationNumber)
            ? string.Empty
            : $"Registration number: {company.RegistrationNumber}\n";

        var subject = $"Your Ops Arrow company is set up — {company.CompanyName}";
        var body =
            $"{greeting}\n\n" +
            $"Your company \"{company.CompanyName}\" has been created on Ops Arrow.\n\n" +
            registrationLine +
            $"Account email: {recipient}\n\n" +
            $"Next step: set up your shop on the Ops Arrow web platform. Sign in with this email and add " +
            $"your first shop here:\n\n" +
            $"{_webPortalUrl}\n\n" +
            $"Once your shop is created you can manage it from the mobile app too.\n\n" +
            $"If you didn't request this email you can safely ignore it.\n\n" +
            $"Thanks,\nOps Arrow";

        await _emailSender.SendAsync(recipient, subject, body, cancellationToken);

        // Only arm the rate limit once the send succeeded so a transient SMTP failure can be retried.
        _memoryCache.Set(rateLimitKey, DateTimeOffset.UtcNow, SetupEmailRateLimitWindow);

        await _auditService.LogAsync(nameof(Company), companyId, "CompanySetupEmailSent", cancellationToken: cancellationToken);
    }

    // Canonical web-platform base URL for owner links: prefer the explicit App:WebPortalUrl, else derive
    // from the billing host (same web app, minus a trailing "/billing"), else a hard default.
    private static string ResolveWebPortalUrl(IConfiguration configuration)
    {
        var explicitUrl = configuration["App:WebPortalUrl"]?.Trim();
        if (!string.IsNullOrWhiteSpace(explicitUrl))
        {
            return explicitUrl.TrimEnd('/');
        }

        var billing = configuration["Billing:PortalUrl"]?.Trim();
        if (!string.IsNullOrWhiteSpace(billing))
        {
            var trimmed = billing.TrimEnd('/');
            if (trimmed.EndsWith("/billing", StringComparison.OrdinalIgnoreCase))
            {
                trimmed = trimmed[..^"/billing".Length];
            }
            if (!string.IsNullOrWhiteSpace(trimmed))
            {
                return trimmed;
            }
        }

        return DefaultWebPortalUrl;
    }

    private static string NormalizeEmail(string? value) => value?.Trim().ToLowerInvariant() ?? string.Empty;

    private void EnsureCompanyWriteAccess()
    {
        if (_currentUserService.IsInRole(RoleNames.PlatformAdmin) || _currentUserService.IsOwner())
        {
            return;
        }

        throw new AppException(ErrorCodes.UnauthorizedRole, "Only platform admin or company owner can edit company details.", 403);
    }

    private async Task EnsureCompanyAccessAsync(Guid companyId, CancellationToken cancellationToken)
    {
        if (!_currentUserService.UserId.HasValue)
        {
            throw new AppException("unauthorized", "User context is missing.", 401);
        }

        var companyOwnerAccess = await _companyRepository.Query()
            .AsNoTracking()
            .AnyAsync(
                x => x.Id == companyId &&
                     !x.IsDeleted &&
                     x.OwnerUserId == _currentUserService.UserId.Value,
                cancellationToken);

        if (companyOwnerAccess)
        {
            return;
        }

        var hasCompanyAccess = await _shopUserRepository.Query()
            .AsNoTracking()
            .AnyAsync(
                x => x.UserId == _currentUserService.UserId.Value &&
                     x.IsActive &&
                     x.Shop.CompanyId == companyId,
                cancellationToken);

        if (!hasCompanyAccess)
        {
            throw new AppException(ErrorCodes.UnauthorizedRole, "You do not have access to this company.", 403);
        }
    }

    private async Task EnsureCompanyOwnerRoleAssignedAsync(Guid userId, CancellationToken cancellationToken)
    {
        var ownerRole = await _roleRepository.Query()
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Name == RoleNames.CompanyOwner && x.IsActive, cancellationToken)
            ?? throw new AppException("role_not_found", "CompanyOwner role not found.", 404);

        var existingRole = await _userRoleRepository.Query()
            .FirstOrDefaultAsync(x => x.UserId == userId && x.RoleId == ownerRole.Id, cancellationToken);

        var now = DateTimeOffset.UtcNow;
        if (existingRole is null)
        {
            await _userRoleRepository.AddAsync(new UserRole
            {
                UserId = userId,
                RoleId = ownerRole.Id,
                IsActive = true,
                AssignedOn = now,
                CreatedOn = now,
                CreatedBy = _currentUserService.UserId
            }, cancellationToken);
            return;
        }

        if (existingRole.IsActive)
        {
            return;
        }

        existingRole.IsActive = true;
        existingRole.AssignedOn = now;
        existingRole.ModifiedOn = now;
        existingRole.ModifiedBy = _currentUserService.UserId;
        _userRoleRepository.Update(existingRole);
    }
}






