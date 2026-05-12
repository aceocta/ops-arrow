using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Shops;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Enums;
using ScratchCard.Domain.Entities;

namespace ScratchCard.Application.Services;

public class ShopService : IShopService
{
    private const string DefaultStartSerialNumber = "00";

    private readonly IRepository<Shop> _shopRepository;
    private readonly IRepository<Company> _companyRepository;
    private readonly IRepository<ShopUser> _shopUserRepository;
    private readonly IRepository<Role> _roleRepository;
    private readonly IRepository<ScratchCardGame> _masterGameRepository;
    private readonly IRepository<ShopScratchCardGame> _shopGameRepository;
    private readonly IRepository<CompanySubscription> _companySubscriptionRepository;
    private readonly IRepository<BillingEvent> _billingEventRepository;
    private readonly ISubscriptionCalculationService _subscriptionCalculationService;
    private readonly IAuditService _auditService;
    private readonly ICurrentUserService _currentUserService;
    private readonly IUnitOfWork _unitOfWork;

    public ShopService(
        IRepository<Shop> shopRepository,
        IRepository<Company> companyRepository,
        IRepository<ShopUser> shopUserRepository,
        IRepository<Role> roleRepository,
        IRepository<ScratchCardGame> masterGameRepository,
        IRepository<ShopScratchCardGame> shopGameRepository,
        IRepository<CompanySubscription> companySubscriptionRepository,
        IRepository<BillingEvent> billingEventRepository,
        ISubscriptionCalculationService subscriptionCalculationService,
        IAuditService auditService,
        ICurrentUserService currentUserService,
        IUnitOfWork unitOfWork)
    {
        _shopRepository = shopRepository;
        _companyRepository = companyRepository;
        _shopUserRepository = shopUserRepository;
        _roleRepository = roleRepository;
        _masterGameRepository = masterGameRepository;
        _shopGameRepository = shopGameRepository;
        _companySubscriptionRepository = companySubscriptionRepository;
        _billingEventRepository = billingEventRepository;
        _subscriptionCalculationService = subscriptionCalculationService;
        _auditService = auditService;
        _currentUserService = currentUserService;
        _unitOfWork = unitOfWork;
    }

    public async Task<ShopDto> CreateAsync(CreateShopRequest request, CancellationToken cancellationToken = default)
    {
        var resolvedCompany = await ResolveCompanyAsync(request, cancellationToken);
        var shopName = request.ShopName.Trim();

        if (string.IsNullOrWhiteSpace(shopName))
        {
            throw new AppException("validation_failed", "Shop name is required.", 400);
        }

        var duplicateShop = await _shopRepository.Query()
            .AsNoTracking()
            .AnyAsync(
                x => x.CompanyId == resolvedCompany.Id &&
                     x.ShopName == shopName &&
                     !x.IsDeleted,
                cancellationToken);

        if (duplicateShop)
        {
            throw new AppException("duplicate_shop_name", "A shop with the same name already exists in this company.", 409);
        }

        var shop = new Shop
        {
            CompanyId = resolvedCompany.Id,
            ShopName = shopName,
            AddressLine1 = request.AddressLine1.Trim(),
            AddressLine2 = string.IsNullOrWhiteSpace(request.AddressLine2) ? null : request.AddressLine2.Trim(),
            City = request.City.Trim(),
            PostCode = request.PostCode.Trim(),
            Country = request.Country.Trim(),
            IsActive = true,
            IsDeleted = false,
            CreatedOn = DateTimeOffset.UtcNow,
            CreatedBy = _currentUserService.UserId
        };

        await _shopRepository.AddAsync(shop, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        await AssignActiveMasterGamesToShopAsync(shop, cancellationToken);
        await EnsureCreatorOwnershipAsync(shop, cancellationToken);
        await RecalculateCompanySubscriptionAsync(
            resolvedCompany.Id,
            $"Shop added: {shop.ShopName}",
            cancellationToken);

        await _auditService.LogAsync(nameof(Shop), shop.Id, "ShopCreated", shop.Id, cancellationToken: cancellationToken);

        var createdShop = await _shopRepository.Query()
            .AsNoTracking()
            .Include(x => x.Company)
            .FirstAsync(x => x.Id == shop.Id, cancellationToken);

        return createdShop.ToDto();
    }

    public async Task<ShopDto> UpdateAsync(Guid id, UpdateShopRequest request, CancellationToken cancellationToken = default)
    {
        var shop = await _shopRepository.Query()
            .FirstOrDefaultAsync(x => x.Id == id && !x.IsDeleted, cancellationToken)
            ?? throw new AppException("shop_not_found", "Shop not found.", 404);

        await EnsureShopAccessAsync(shop, cancellationToken);

        var shopName = request.ShopName.Trim();
        var duplicateShop = await _shopRepository.Query()
            .AsNoTracking()
            .AnyAsync(
                x => x.Id != id &&
                     x.CompanyId == shop.CompanyId &&
                     x.ShopName == shopName &&
                     !x.IsDeleted,
                cancellationToken);

        if (duplicateShop)
        {
            throw new AppException("duplicate_shop_name", "A shop with the same name already exists in this company.", 409);
        }

        shop.ShopName = shopName;
        shop.AddressLine1 = request.AddressLine1.Trim();
        shop.AddressLine2 = string.IsNullOrWhiteSpace(request.AddressLine2) ? null : request.AddressLine2.Trim();
        shop.City = request.City.Trim();
        shop.PostCode = request.PostCode.Trim();
        shop.Country = request.Country.Trim();
        var activeStateChanged = shop.IsActive != request.IsActive;
        shop.IsActive = request.IsActive;
        shop.ModifiedOn = DateTimeOffset.UtcNow;
        shop.ModifiedBy = _currentUserService.UserId;

        _shopRepository.Update(shop);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        if (activeStateChanged && shop.CompanyId.HasValue)
        {
            await RecalculateCompanySubscriptionAsync(
                shop.CompanyId.Value,
                $"Shop {(request.IsActive ? "activated" : "deactivated")}: {shop.ShopName}",
                cancellationToken);
        }

        await _auditService.LogAsync(nameof(Shop), shop.Id, "ShopUpdated", shop.Id, cancellationToken: cancellationToken);
        var updatedShop = await _shopRepository.Query()
            .AsNoTracking()
            .Include(x => x.Company)
            .FirstAsync(x => x.Id == shop.Id, cancellationToken);

        return updatedShop.ToDto();
    }

    public async Task<ShopDto> GetAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var shop = await _shopRepository.Query()
            .Include(x => x.Company)
            .FirstOrDefaultAsync(x => x.Id == id && !x.IsDeleted, cancellationToken)
            ?? throw new AppException("shop_not_found", "Shop not found.", 404);

        await EnsureShopAccessAsync(shop, cancellationToken);

        return shop.ToDto();
    }

    public async Task<IReadOnlyCollection<ShopDto>> ListAsync(Guid? companyId, CancellationToken cancellationToken = default)
    {
        if (!_currentUserService.UserId.HasValue)
        {
            throw new AppException("unauthorized", "User context is missing.", 401);
        }

        var userId = _currentUserService.UserId.Value;
        var accessRows = await _shopUserRepository.Query()
            .AsNoTracking()
            .Where(x => x.UserId == userId && x.IsActive)
            .Select(x => new
            {
                x.ShopId,
                x.Shop.CompanyId
            })
            .ToListAsync(cancellationToken);

        var accessibleShopIds = accessRows.Select(x => x.ShopId).Distinct().ToArray();
        var accessibleCompanyIds = accessRows
            .Where(x => x.CompanyId.HasValue)
            .Select(x => x.CompanyId!.Value)
            .Distinct()
            .ToArray();

        var query = _shopRepository.Query()
            .AsNoTracking()
            .Include(x => x.Company)
            .Where(x =>
                accessibleShopIds.Contains(x.Id) ||
                (x.CompanyId.HasValue && accessibleCompanyIds.Contains(x.CompanyId.Value)))
            .Where(x => !x.IsDeleted)
            .AsQueryable();

        if (companyId.HasValue)
        {
            query = query.Where(x => x.CompanyId == companyId.Value);
        }

        var shops = await query
            .OrderBy(x => x.ShopName)
            .ToListAsync(cancellationToken);

        return shops.Select(x => x.ToDto()).ToArray();
    }

    private async Task AssignActiveMasterGamesToShopAsync(Shop shop, CancellationToken cancellationToken)
    {
        var activeMasterGames = await _masterGameRepository.Query()
            .AsNoTracking()
            .Where(x => x.IsActive && !x.IsDeleted)
            .Select(x => new
            {
                x.Id,
                x.TicketsPerPack
            })
            .ToListAsync(cancellationToken);

        if (activeMasterGames.Count == 0)
        {
            return;
        }

        var now = DateTimeOffset.UtcNow;
        var assignments = activeMasterGames.Select(masterGame =>
        {
            var (_, defaultEndSerialNumber) = BuildDefaultSerialRange(masterGame.TicketsPerPack);
            return new ShopScratchCardGame
            {
                ShopId = shop.Id,
                MasterGameId = masterGame.Id,
                IsActive = true,
                DefaultStartSerialNumber = DefaultStartSerialNumber,
                DefaultEndSerialNumber = defaultEndSerialNumber,
                DefaultSellingOrder = SellingOrder.Ascending,
                CreatedOn = now,
                CreatedBy = _currentUserService.UserId
            };
        });

        await _shopGameRepository.AddRangeAsync(assignments, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
    }

    private static (string StartSerial, string EndSerial) BuildDefaultSerialRange(int ticketsPerPack)
    {
        var safeTicketsPerPack = Math.Max(2, ticketsPerPack);
        var endSerial = (safeTicketsPerPack - 1).ToString();
        return (DefaultStartSerialNumber, endSerial);
    }

    private async Task<Company> ResolveCompanyAsync(CreateShopRequest request, CancellationToken cancellationToken)
    {
        if (request.CompanyId.HasValue)
        {
            var company = await _companyRepository.GetByIdAsync(request.CompanyId.Value, cancellationToken)
                ?? throw new AppException("company_not_found", "Company not found.", 404);

            if (!company.IsActive || company.IsDeleted)
            {
                throw new AppException("company_inactive", "Company is inactive.", 400);
            }

            if (_currentUserService.UserId.HasValue)
            {
                var hasShopAccess = await _shopUserRepository.Query()
                    .AsNoTracking()
                    .AnyAsync(
                        x => x.UserId == _currentUserService.UserId.Value &&
                             x.IsActive &&
                             x.Shop.CompanyId == request.CompanyId.Value,
                        cancellationToken);

                var isCompanyOwner = company.OwnerUserId == _currentUserService.UserId.Value;
                if (!hasShopAccess && !isCompanyOwner)
                {
                    throw new AppException("unauthorized_role", "You cannot create a shop for this company.", 403);
                }
            }

            return company;
        }

        if (_currentUserService.UserId.HasValue)
        {
            var existingCompanyId = await _shopUserRepository.Query()
                .AsNoTracking()
                .Where(x => x.UserId == _currentUserService.UserId.Value && x.IsActive && x.Shop.CompanyId != null)
                .Select(x => x.Shop.CompanyId)
                .FirstOrDefaultAsync(cancellationToken);

            if (existingCompanyId.HasValue)
            {
                var company = await _companyRepository.GetByIdAsync(existingCompanyId.Value, cancellationToken);
                if (company is not null)
                {
                    return company;
                }
            }

            var ownedCompany = await _companyRepository.Query()
                .AsNoTracking()
                .Where(x => !x.IsDeleted && x.IsActive && x.OwnerUserId == _currentUserService.UserId.Value)
                .OrderBy(x => x.CreatedOn)
                .FirstOrDefaultAsync(cancellationToken);

            if (ownedCompany is not null)
            {
                return ownedCompany;
            }
        }

        if (!string.IsNullOrWhiteSpace(request.CompanyName))
        {
            var normalizedOwnerEmail = NormalizeEmail(_currentUserService.Email);
            if (string.IsNullOrWhiteSpace(normalizedOwnerEmail))
            {
                throw new AppException("validation_failed", "Owner email is required.", 400);
            }

            var existingByEmail = await _companyRepository.Query()
                .FirstOrDefaultAsync(x => x.Email == normalizedOwnerEmail && !x.IsDeleted, cancellationToken);

            if (existingByEmail is not null)
            {
                return existingByEmail;
            }

            var company = new Company
            {
                CompanyName = request.CompanyName.Trim(),
                OwnerUserId = _currentUserService.UserId,
                Email = normalizedOwnerEmail,
                Country = string.IsNullOrWhiteSpace(request.Country) ? "UK" : request.Country.Trim(),
                Status = Domain.Enums.CompanyStatus.Active,
                IsActive = true,
                IsDeleted = false,
                CreatedOn = DateTimeOffset.UtcNow,
                CreatedBy = _currentUserService.UserId
            };

            await _companyRepository.AddAsync(company, cancellationToken);
            await _unitOfWork.SaveChangesAsync(cancellationToken);
            await _auditService.LogAsync(nameof(Company), company.Id, "CompanyCreated", cancellationToken: cancellationToken);
            return company;
        }

        throw new AppException(
            "company_required",
            "Company is required. Provide CompanyId or CompanyName when creating a shop.",
            400);
    }

    private static string NormalizeEmail(string? value) => value?.Trim().ToLowerInvariant() ?? string.Empty;

    private async Task EnsureShopAccessAsync(Shop shop, CancellationToken cancellationToken)
    {
        if (!_currentUserService.UserId.HasValue)
        {
            throw new AppException("unauthorized", "User context is missing.", 401);
        }

        var userId = _currentUserService.UserId.Value;

        var directAccess = await _shopUserRepository.Query()
            .AsNoTracking()
            .AnyAsync(x => x.UserId == userId && x.ShopId == shop.Id && x.IsActive, cancellationToken);

        if (directAccess)
        {
            return;
        }

        if (!shop.CompanyId.HasValue)
        {
            throw new AppException(ErrorCodes.UnauthorizedRole, "You do not have access to this shop.", 403);
        }

        var companyAccess = await _shopUserRepository.Query()
            .AsNoTracking()
            .AnyAsync(
                x => x.UserId == userId &&
                     x.IsActive &&
                     x.Shop.CompanyId == shop.CompanyId.Value,
                cancellationToken);

        if (!companyAccess)
        {
            throw new AppException(ErrorCodes.UnauthorizedRole, "You do not have access to this shop.", 403);
        }
    }

    private async Task EnsureCreatorOwnershipAsync(Shop shop, CancellationToken cancellationToken)
    {
        if (!_currentUserService.UserId.HasValue)
        {
            return;
        }

        var userId = _currentUserService.UserId.Value;
        var existingShopUser = await _shopUserRepository.Query()
            .FirstOrDefaultAsync(x => x.ShopId == shop.Id && x.UserId == userId, cancellationToken);

        if (existingShopUser is not null)
        {
            return;
        }

        var ownerRole = await _roleRepository.Query()
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Name == RoleNames.ShopOwner && x.IsActive, cancellationToken)
            ?? throw new AppException("role_not_found", "ShopOwner role not found.", 404);

        var shopUser = new ShopUser
        {
            ShopId = shop.Id,
            UserId = userId,
            RoleId = ownerRole.Id,
            IsActive = true,
            JoinedOn = DateTimeOffset.UtcNow,
            CreatedOn = DateTimeOffset.UtcNow,
            CreatedBy = userId
        };

        await _shopUserRepository.AddAsync(shopUser, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
    }

    private async Task RecalculateCompanySubscriptionAsync(Guid companyId, string reason, CancellationToken cancellationToken)
    {
        var subscription = await _companySubscriptionRepository.Query()
            .FirstOrDefaultAsync(x => x.CompanyId == companyId, cancellationToken);

        if (subscription is null)
        {
            return;
        }

        var previousShopCount = subscription.ActiveShopCount;
        var previousTotal = subscription.TotalAmount;

        var recalculated = await _subscriptionCalculationService.CalculateAsync(
            companyId,
            subscription.SubscriptionPlanId,
            cancellationToken);

        subscription.ActiveShopCount = recalculated.ActiveShopCount;
        subscription.PricePerShop = recalculated.PricePerShop;
        subscription.SubTotalAmount = recalculated.SubTotalAmount;
        subscription.DiscountPercentage = recalculated.DiscountPercentage;
        subscription.DiscountAmount = recalculated.DiscountAmount;
        subscription.TotalAmount = recalculated.TotalAmount;
        subscription.ModifiedOn = DateTimeOffset.UtcNow;
        subscription.ModifiedBy = _currentUserService.UserId;
        _companySubscriptionRepository.Update(subscription);

        await _billingEventRepository.AddAsync(new BillingEvent
        {
            CompanyId = companyId,
            CompanySubscriptionId = subscription.Id,
            EventType = BillingEventType.ShopCountChanged,
            Description = reason,
            OldValue = $"ShopCount={previousShopCount};Total={previousTotal}",
            NewValue = $"ShopCount={recalculated.ActiveShopCount};Total={recalculated.TotalAmount}",
            CreatedOn = DateTimeOffset.UtcNow,
            CreatedBy = _currentUserService.UserId
        }, cancellationToken);

        if (recalculated.DiscountAmount > 0)
        {
            await _billingEventRepository.AddAsync(new BillingEvent
            {
                CompanyId = companyId,
                CompanySubscriptionId = subscription.Id,
                EventType = BillingEventType.DiscountApplied,
                Description = "Discount applied after shop count change.",
                NewValue = $"Discount={recalculated.DiscountAmount};Percentage={recalculated.DiscountPercentage}",
                CreatedOn = DateTimeOffset.UtcNow,
                CreatedBy = _currentUserService.UserId
            }, cancellationToken);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);
    }
}
