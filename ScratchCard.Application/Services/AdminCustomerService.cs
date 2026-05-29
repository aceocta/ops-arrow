using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Admin;
using ScratchCard.Application.DTOs.Invitations;
using ScratchCard.Domain.Entities;
using ScratchCard.Domain.Enums;
using ScratchCard.Shared.Models;

namespace ScratchCard.Application.Services;

/// <summary>
/// PlatformAdmin-only view/management of customers (Companies) across the whole platform.
/// Authorization is enforced by the [Authorize(Roles = PlatformAdmin)] gate on the controller,
/// so this service intentionally does NOT apply the per-company membership checks used by the
/// owner/manager-facing CompanyService.
/// </summary>
public class AdminCustomerService : IAdminCustomerService
{
    private readonly IRepository<Company> _companyRepository;
    private readonly IRepository<Shop> _shopRepository;
    private readonly IRepository<ShopUser> _shopUserRepository;
    private readonly IRepository<ShopSubscription> _shopSubscriptionRepository;
    private readonly IUserService _userService;
    private readonly IShopSubscriptionService _shopSubscriptionService;
    private readonly IInvitationService _invitationService;
    private readonly ICurrentUserService _currentUserService;
    private readonly IAuditService _auditService;
    private readonly IUnitOfWork _unitOfWork;

    public AdminCustomerService(
        IRepository<Company> companyRepository,
        IRepository<Shop> shopRepository,
        IRepository<ShopUser> shopUserRepository,
        IRepository<ShopSubscription> shopSubscriptionRepository,
        IUserService userService,
        IShopSubscriptionService shopSubscriptionService,
        IInvitationService invitationService,
        ICurrentUserService currentUserService,
        IAuditService auditService,
        IUnitOfWork unitOfWork)
    {
        _companyRepository = companyRepository;
        _shopRepository = shopRepository;
        _shopUserRepository = shopUserRepository;
        _shopSubscriptionRepository = shopSubscriptionRepository;
        _userService = userService;
        _shopSubscriptionService = shopSubscriptionService;
        _invitationService = invitationService;
        _currentUserService = currentUserService;
        _auditService = auditService;
        _unitOfWork = unitOfWork;
    }

    public async Task<PagedResult<CustomerListItemDto>> ListCustomersAsync(
        string? search,
        int page,
        int pageSize,
        CancellationToken cancellationToken = default)
    {
        page = page < 1 ? 1 : page;
        pageSize = pageSize is < 1 or > 100 ? 20 : pageSize;

        var query = _companyRepository.Query().AsNoTracking().Where(x => !x.IsDeleted);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(x => EF.Functions.Like(x.CompanyName, $"%{term}%")
                                     || EF.Functions.Like(x.Email, $"%{term}%"));
        }

        var totalCount = await query.CountAsync(cancellationToken);

        var pageCompanies = await query
            .OrderBy(x => x.CompanyName)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(x => new
            {
                x.Id,
                x.CompanyName,
                x.Email,
                x.PhoneNumber,
                x.Status,
                x.IsActive,
                x.CreatedOn
            })
            .ToListAsync(cancellationToken);

        var companyIds = pageCompanies.Select(x => x.Id).ToList();

        var shopCounts = await _shopRepository.Query().AsNoTracking()
            .Where(s => s.CompanyId != null && companyIds.Contains(s.CompanyId.Value) && !s.IsDeleted)
            .GroupBy(s => s.CompanyId!.Value)
            .Select(g => new { CompanyId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.CompanyId, x => x.Count, cancellationToken);

        var userCounts = await _shopUserRepository.Query().AsNoTracking()
            .Where(su => su.IsActive && su.Shop.CompanyId != null && companyIds.Contains(su.Shop.CompanyId.Value))
            .GroupBy(su => su.Shop.CompanyId!.Value)
            .Select(g => new { CompanyId = g.Key, Count = g.Select(x => x.UserId).Distinct().Count() })
            .ToDictionaryAsync(x => x.CompanyId, x => x.Count, cancellationToken);

        var subStatuses = await _shopSubscriptionRepository.Query().AsNoTracking()
            .Where(ss => companyIds.Contains(ss.CompanyId))
            .Select(ss => new { ss.CompanyId, ss.Status })
            .ToListAsync(cancellationToken);

        var subStatusByCompany = subStatuses
            .GroupBy(x => x.CompanyId)
            .ToDictionary(g => g.Key, g => RollUpStatus(g.Select(x => x.Status)));

        var items = pageCompanies.Select(c => new CustomerListItemDto
        {
            Id = c.Id,
            CompanyName = c.CompanyName,
            Email = c.Email,
            PhoneNumber = c.PhoneNumber,
            Status = c.Status.ToString(),
            IsActive = c.IsActive,
            ShopCount = shopCounts.GetValueOrDefault(c.Id),
            UserCount = userCounts.GetValueOrDefault(c.Id),
            SubscriptionStatus = subStatusByCompany.GetValueOrDefault(c.Id, "None"),
            CreatedOn = c.CreatedOn
        }).ToArray();

        return new PagedResult<CustomerListItemDto> { Items = items, TotalCount = totalCount };
    }

    public async Task<PagedResult<AdminShopListItemDto>> ListShopsAsync(
        string? search,
        int page,
        int pageSize,
        CancellationToken cancellationToken = default)
    {
        page = page < 1 ? 1 : page;
        pageSize = pageSize is < 1 or > 100 ? 20 : pageSize;

        var query = _shopRepository.Query().AsNoTracking().Where(x => !x.IsDeleted);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(x => EF.Functions.Like(x.ShopName, $"%{term}%")
                                     || (x.Company != null && EF.Functions.Like(x.Company.CompanyName, $"%{term}%")));
        }

        var totalCount = await query.CountAsync(cancellationToken);

        var pageShops = await query
            .OrderBy(x => x.ShopName)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(x => new
            {
                x.Id,
                x.ShopName,
                x.City,
                x.IsActive,
                x.CompanyId,
                CompanyName = x.Company != null ? x.Company.CompanyName : string.Empty
            })
            .ToListAsync(cancellationToken);

        var shopIds = pageShops.Select(x => x.Id).ToList();

        var subs = await _shopSubscriptionRepository.Query().AsNoTracking()
            .Where(ss => shopIds.Contains(ss.ShopId))
            .Select(ss => new { ss.ShopId, ss.Status, PlanName = ss.SubscriptionPlan != null ? ss.SubscriptionPlan.Name : null })
            .ToListAsync(cancellationToken);

        var statusByShop = subs.GroupBy(x => x.ShopId)
            .ToDictionary(g => g.Key, g => RollUpStatus(g.Select(x => x.Status)));
        var planByShop = subs.GroupBy(x => x.ShopId)
            .ToDictionary(
                g => g.Key,
                g => g.OrderBy(x => x.Status == SubscriptionStatus.Active ? 0 : x.Status == SubscriptionStatus.TrialActive ? 1 : 2)
                      .Select(x => x.PlanName)
                      .FirstOrDefault(x => !string.IsNullOrWhiteSpace(x)));

        var items = pageShops.Select(s => new AdminShopListItemDto
        {
            Id = s.Id,
            ShopName = s.ShopName,
            City = s.City,
            IsActive = s.IsActive,
            CompanyId = s.CompanyId,
            CompanyName = s.CompanyName,
            SubscriptionStatus = statusByShop.GetValueOrDefault(s.Id, "None"),
            SubscriptionPlanName = planByShop.GetValueOrDefault(s.Id)
        }).ToArray();

        return new PagedResult<AdminShopListItemDto> { Items = items, TotalCount = totalCount };
    }

    public async Task<CustomerDetailDto> GetCustomerAsync(Guid companyId, CancellationToken cancellationToken = default)
    {
        var company = await _companyRepository.Query().AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == companyId && !x.IsDeleted, cancellationToken)
            ?? throw new AppException("company_not_found", "Customer not found.", 404);

        var shops = await _shopRepository.Query().AsNoTracking()
            .Where(s => s.CompanyId == companyId && !s.IsDeleted)
            .OrderBy(s => s.ShopName)
            .Select(s => new { s.Id, s.ShopName, s.City, s.IsActive })
            .ToListAsync(cancellationToken);

        var subsByShop = await _shopSubscriptionRepository.Query().AsNoTracking()
            .Where(ss => ss.CompanyId == companyId)
            .Select(ss => new { ss.ShopId, ss.Status, PlanName = ss.SubscriptionPlan != null ? ss.SubscriptionPlan.Name : null })
            .ToListAsync(cancellationToken);

        var statusByShop = subsByShop
            .GroupBy(x => x.ShopId)
            .ToDictionary(g => g.Key, g => RollUpStatus(g.Select(x => x.Status)));

        // Plan name from the representative subscription (same Active > Trial > first priority used
        // for the rolled-up status), so the displayed plan matches the displayed status.
        var planNameByShop = subsByShop
            .GroupBy(x => x.ShopId)
            .ToDictionary(
                g => g.Key,
                g => g
                    .OrderBy(x => x.Status == SubscriptionStatus.Active ? 0 : x.Status == SubscriptionStatus.TrialActive ? 1 : 2)
                    .Select(x => x.PlanName)
                    .FirstOrDefault(x => !string.IsNullOrWhiteSpace(x)));

        var shopDtos = shops.Select(s => new ShopSummaryDto
        {
            Id = s.Id,
            ShopName = s.ShopName,
            City = s.City,
            IsActive = s.IsActive,
            SubscriptionStatus = statusByShop.GetValueOrDefault(s.Id, "None"),
            SubscriptionPlanName = planNameByShop.GetValueOrDefault(s.Id)
        }).ToArray();

        var users = await _shopUserRepository.Query().AsNoTracking()
            .Where(su => su.Shop.CompanyId == companyId)
            .OrderBy(su => su.User.FirstName)
            .Select(su => new CustomerUserDto
            {
                UserId = su.UserId,
                FullName = (su.User.FirstName + " " + su.User.LastName).Trim(),
                Email = su.User.Email,
                ShopId = su.ShopId,
                ShopName = su.Shop.ShopName,
                RoleId = su.RoleId,
                RoleName = su.Role.Name,
                IsActive = su.IsActive,
                LastLoginOn = su.User.LastLoginOn
            })
            .ToListAsync(cancellationToken);

        var subscription = new CustomerSubscriptionDto
        {
            Status = RollUpStatus(subsByShop.Select(x => x.Status)),
            TotalShopSubscriptionCount = subsByShop.Count,
            ActiveShopSubscriptionCount = subsByShop.Count(x => x.Status == SubscriptionStatus.Active || x.Status == SubscriptionStatus.TrialActive),
            PlanName = subsByShop.Select(x => x.PlanName).FirstOrDefault(x => !string.IsNullOrWhiteSpace(x))
        };

        return new CustomerDetailDto
        {
            Id = company.Id,
            CompanyName = company.CompanyName,
            RegistrationNumber = company.RegistrationNumber,
            Email = company.Email,
            PhoneNumber = company.PhoneNumber,
            AddressLine1 = company.AddressLine1,
            AddressLine2 = company.AddressLine2,
            City = company.City,
            PostCode = company.PostCode,
            Country = company.Country,
            Status = company.Status.ToString(),
            IsActive = company.IsActive,
            CreatedOn = company.CreatedOn,
            Shops = shopDtos,
            Users = users,
            Subscription = subscription
        };
    }

    public async Task<CustomerDetailDto> UpdateCustomerAsync(
        Guid companyId,
        AdminUpdateCustomerRequest request,
        CancellationToken cancellationToken = default)
    {
        var company = await _companyRepository.GetByIdAsync(companyId, cancellationToken);
        if (company is null || company.IsDeleted)
        {
            throw new AppException("company_not_found", "Customer not found.", 404);
        }

        var companyName = request.CompanyName.Trim();
        var duplicateName = await _companyRepository.Query().AsNoTracking()
            .AnyAsync(x => x.Id != companyId && x.CompanyName == companyName && !x.IsDeleted, cancellationToken);
        if (duplicateName)
        {
            throw new AppException("duplicate_company_name", "A company with the same name already exists.", 409);
        }

        company.CompanyName = companyName;
        company.RegistrationNumber = string.IsNullOrWhiteSpace(request.RegistrationNumber) ? null : request.RegistrationNumber.Trim();
        company.Email = request.Email.Trim().ToLowerInvariant();
        company.PhoneNumber = string.IsNullOrWhiteSpace(request.PhoneNumber) ? null : request.PhoneNumber.Trim();
        company.AddressLine1 = string.IsNullOrWhiteSpace(request.AddressLine1) ? null : request.AddressLine1.Trim();
        company.AddressLine2 = string.IsNullOrWhiteSpace(request.AddressLine2) ? null : request.AddressLine2.Trim();
        company.City = string.IsNullOrWhiteSpace(request.City) ? null : request.City.Trim();
        company.PostCode = string.IsNullOrWhiteSpace(request.PostCode) ? null : request.PostCode.Trim();
        if (!string.IsNullOrWhiteSpace(request.Country))
        {
            company.Country = request.Country.Trim();
        }
        company.IsActive = request.IsActive;
        company.Status = request.IsActive ? CompanyStatus.Active : CompanyStatus.Suspended;
        company.ModifiedOn = DateTimeOffset.UtcNow;
        company.ModifiedBy = _currentUserService.UserId;

        _companyRepository.Update(company);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(nameof(Company), company.Id, "AdminCustomerUpdated", cancellationToken: cancellationToken);

        return await GetCustomerAsync(companyId, cancellationToken);
    }

    public async Task<CustomerDetailDto> SetCustomerStatusAsync(
        Guid companyId,
        bool isActive,
        CancellationToken cancellationToken = default)
    {
        var company = await _companyRepository.GetByIdAsync(companyId, cancellationToken);
        if (company is null || company.IsDeleted)
        {
            throw new AppException("company_not_found", "Customer not found.", 404);
        }

        company.IsActive = isActive;
        company.Status = isActive ? CompanyStatus.Active : CompanyStatus.Suspended;
        company.ModifiedOn = DateTimeOffset.UtcNow;
        company.ModifiedBy = _currentUserService.UserId;

        _companyRepository.Update(company);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(
            nameof(Company),
            company.Id,
            isActive ? "AdminCustomerActivated" : "AdminCustomerSuspended",
            cancellationToken: cancellationToken);

        return await GetCustomerAsync(companyId, cancellationToken);
    }

    public async Task<CustomerDetailDto> SetUserActiveAsync(
        Guid companyId,
        Guid userId,
        Guid shopId,
        bool isActive,
        CancellationToken cancellationToken = default)
    {
        await EnsureShopBelongsToCompanyAsync(companyId, shopId, cancellationToken);
        // UserService already lets PlatformAdmin manage any shop's users; reuse it so the
        // active-state semantics stay identical to the owner/manager flow.
        await _userService.SetActiveAsync(userId, shopId, isActive, cancellationToken);
        return await GetCustomerAsync(companyId, cancellationToken);
    }

    public async Task<CustomerDetailDto> AssignUserRoleAsync(
        Guid companyId,
        Guid userId,
        Guid shopId,
        Guid roleId,
        CancellationToken cancellationToken = default)
    {
        await EnsureShopBelongsToCompanyAsync(companyId, shopId, cancellationToken);
        await _userService.UpdateRoleAsync(
            userId,
            new DTOs.Users.UpdateUserRoleRequest { ShopId = shopId, RoleId = roleId },
            cancellationToken);
        return await GetCustomerAsync(companyId, cancellationToken);
    }

    public async Task<CustomerDetailDto> SelectShopPlanAsync(
        Guid companyId,
        Guid shopId,
        Guid planId,
        CancellationToken cancellationToken = default)
    {
        await EnsureShopBelongsToCompanyAsync(companyId, shopId, cancellationToken);
        // Subscriptions are managed per shop (the live product model); reuse the shop subscription
        // service so behaviour matches the owner/manager flow.
        await _shopSubscriptionService.SelectPlanAsync(
            new DTOs.Subscriptions.SelectShopSubscriptionPlanRequest { ShopId = shopId, PlanId = planId },
            cancellationToken);
        return await GetCustomerAsync(companyId, cancellationToken);
    }

    public async Task<CustomerDetailDto> CancelShopSubscriptionAsync(
        Guid companyId,
        Guid shopId,
        bool cancelAtPeriodEnd,
        CancellationToken cancellationToken = default)
    {
        await EnsureShopBelongsToCompanyAsync(companyId, shopId, cancellationToken);
        await _shopSubscriptionService.CancelAsync(shopId, cancelAtPeriodEnd, cancellationToken);
        return await GetCustomerAsync(companyId, cancellationToken);
    }

    public async Task<CustomerDetailDto> ReactivateShopSubscriptionAsync(
        Guid companyId,
        Guid shopId,
        CancellationToken cancellationToken = default)
    {
        await EnsureShopBelongsToCompanyAsync(companyId, shopId, cancellationToken);
        await _shopSubscriptionService.ReactivateAsync(shopId, cancellationToken);
        return await GetCustomerAsync(companyId, cancellationToken);
    }

    public async Task<InvitationDto> InviteShopUserAsync(
        Guid companyId,
        Guid shopId,
        string email,
        Guid roleId,
        int expiryHours,
        CancellationToken cancellationToken = default)
    {
        await EnsureShopBelongsToCompanyAsync(companyId, shopId, cancellationToken);
        // Reuse the invitation service (it already permits PlatformAdmin and enforces the shop's
        // seat limit + sends the invite email).
        return await _invitationService.SendInvitationAsync(
            new CreateInvitationRequest
            {
                ShopId = shopId,
                Email = email,
                RoleId = roleId,
                ExpiryHours = expiryHours <= 0 ? 72 : expiryHours
            },
            cancellationToken);
    }

    // Guards that the targeted shop actually belongs to the customer being managed, so an admin
    // acting on behalf of one customer can't reach into another customer's shop by shop id.
    private async Task EnsureShopBelongsToCompanyAsync(Guid companyId, Guid shopId, CancellationToken cancellationToken)
    {
        var belongs = await _shopRepository.Query().AsNoTracking()
            .AnyAsync(s => s.Id == shopId && s.CompanyId == companyId && !s.IsDeleted, cancellationToken);
        if (!belongs)
        {
            throw new AppException("shop_not_found", "Shop not found for this customer.", 404);
        }
    }

    // Rolls a set of per-shop subscription statuses up into one company-level label, picking the
    // "best" current state: Active > Trial > anything else > None.
    private static string RollUpStatus(IEnumerable<SubscriptionStatus> statuses)
    {
        var list = statuses.ToList();
        if (list.Count == 0) return "None";
        if (list.Contains(SubscriptionStatus.Active)) return SubscriptionStatus.Active.ToString();
        if (list.Contains(SubscriptionStatus.TrialActive)) return SubscriptionStatus.TrialActive.ToString();
        return list[0].ToString();
    }
}
