using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Exceptions;
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
    private readonly ICurrentUserService _currentUserService;
    private readonly IAuditService _auditService;
    private readonly IUnitOfWork _unitOfWork;

    public CompanyService(
        IRepository<Company> companyRepository,
        IRepository<ShopUser> shopUserRepository,
        ICurrentUserService currentUserService,
        IAuditService auditService,
        IUnitOfWork unitOfWork)
    {
        _companyRepository = companyRepository;
        _shopUserRepository = shopUserRepository;
        _currentUserService = currentUserService;
        _auditService = auditService;
        _unitOfWork = unitOfWork;
    }

    public async Task<CompanyDto> CreateAsync(CreateCompanyRequest request, CancellationToken cancellationToken = default)
    {
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
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(nameof(Company), company.Id, "CompanyCreated", cancellationToken: cancellationToken);
        return company.ToDto();
    }

    public async Task<CompanyDto> UpdateAsync(Guid id, UpdateCompanyRequest request, CancellationToken cancellationToken = default)
    {
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

    private static string NormalizeEmail(string? value) => value?.Trim().ToLowerInvariant() ?? string.Empty;

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
}
