using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.StoreSales;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Entities;

namespace ScratchCard.Application.Services;

public class ShopPaymentTypeService : IShopPaymentTypeService
{
    private static readonly string[] EditorRoles =
        [RoleNames.CompanyOwner, RoleNames.Manager];

    private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(5);

    private readonly IRepository<ShopPaymentType> _repository;
    private readonly IShopMembershipService _shopMembershipService;
    private readonly ICurrentUserService _currentUserService;
    private readonly IAuditService _auditService;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IMemoryCache _cache;

    public ShopPaymentTypeService(
        IRepository<ShopPaymentType> repository,
        IShopMembershipService shopMembershipService,
        ICurrentUserService currentUserService,
        IAuditService auditService,
        IUnitOfWork unitOfWork,
        IMemoryCache cache)
    {
        _repository = repository;
        _shopMembershipService = shopMembershipService;
        _currentUserService = currentUserService;
        _auditService = auditService;
        _unitOfWork = unitOfWork;
        _cache = cache;
    }

    private static string ActiveListCacheKey(Guid shopId) => $"shop-payment-types:active:{shopId}";
    private void InvalidateCache(Guid shopId) => _cache.Remove(ActiveListCacheKey(shopId));

    public async Task<IReadOnlyCollection<ShopPaymentTypeDto>> ListAsync(Guid shopId, bool includeInactive, CancellationToken cancellationToken = default)
    {
        await _shopMembershipService.EnsureCurrentUserShopRoleAsync(shopId, RoleNames.All, cancellationToken);

        // Active list is hot (read on every till capture / summary). Cache it; invalidate on
        // mutate. includeInactive is used only on the config screen, no caching needed there.
        if (!includeInactive
            && _cache.TryGetValue<IReadOnlyCollection<ShopPaymentTypeDto>>(ActiveListCacheKey(shopId), out var cached)
            && cached is not null)
        {
            return cached;
        }

        var query = _repository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && !x.IsDeleted);

        if (!includeInactive)
        {
            query = query.Where(x => x.IsActive);
        }

        var items = await query
            .OrderBy(x => x.SortOrder)
            .ThenBy(x => x.Name)
            .ToListAsync(cancellationToken);

        var dto = items.Select(Map).ToArray();
        if (!includeInactive)
        {
            _cache.Set(ActiveListCacheKey(shopId), (IReadOnlyCollection<ShopPaymentTypeDto>)dto, CacheTtl);
        }
        return dto;
    }

    public async Task<ShopPaymentTypeDto> CreateAsync(CreateShopPaymentTypeRequest request, CancellationToken cancellationToken = default)
    {
        await _shopMembershipService.EnsureCurrentUserShopRoleAsync(request.ShopId, EditorRoles, cancellationToken);

        var name = request.Name.Trim();
        var nameTaken = await _repository.Query()
            .AnyAsync(x => x.ShopId == request.ShopId && !x.IsDeleted && x.Name == name, cancellationToken);
        if (nameTaken)
        {
            throw new AppException(ErrorCodes.DuplicatePaymentTypeName, $"A payment type '{name}' already exists for this shop.");
        }

        var entity = new ShopPaymentType
        {
            ShopId = request.ShopId,
            Name = name,
            Code = NullIfBlank(request.Code),
            Keywords = NullIfBlank(request.Keywords),
            SortOrder = request.SortOrder,
            IsActive = true,
            CreatedOn = DateTimeOffset.UtcNow,
            CreatedBy = _currentUserService.UserId
        };

        await _repository.AddAsync(entity, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        InvalidateCache(entity.ShopId);

        await _auditService.LogAsync(nameof(ShopPaymentType), entity.Id, "ShopPaymentTypeCreated", entity.ShopId, cancellationToken: cancellationToken);

        return Map(entity);
    }

    public async Task<ShopPaymentTypeDto> UpdateAsync(Guid id, UpdateShopPaymentTypeRequest request, CancellationToken cancellationToken = default)
    {
        var entity = await _repository.Query()
            .FirstOrDefaultAsync(x => x.Id == id && !x.IsDeleted, cancellationToken)
            ?? throw new AppException(ErrorCodes.PaymentTypeNotFound, "Payment type not found.", 404);

        await _shopMembershipService.EnsureCurrentUserShopRoleAsync(entity.ShopId, EditorRoles, cancellationToken);

        var name = request.Name.Trim();
        if (!string.Equals(entity.Name, name, StringComparison.OrdinalIgnoreCase))
        {
            var nameTaken = await _repository.Query()
                .AnyAsync(x => x.ShopId == entity.ShopId && x.Id != id && !x.IsDeleted && x.Name == name, cancellationToken);
            if (nameTaken)
            {
                throw new AppException(ErrorCodes.DuplicatePaymentTypeName, $"A payment type '{name}' already exists for this shop.");
            }
        }

        entity.Name = name;
        entity.Code = NullIfBlank(request.Code);
        entity.Keywords = NullIfBlank(request.Keywords);
        entity.SortOrder = request.SortOrder;
        entity.IsActive = request.IsActive;
        entity.ModifiedOn = DateTimeOffset.UtcNow;
        entity.ModifiedBy = _currentUserService.UserId;

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        InvalidateCache(entity.ShopId);

        await _auditService.LogAsync(nameof(ShopPaymentType), entity.Id, "ShopPaymentTypeUpdated", entity.ShopId, cancellationToken: cancellationToken);

        return Map(entity);
    }

    public async Task DeleteAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var entity = await _repository.Query()
            .FirstOrDefaultAsync(x => x.Id == id && !x.IsDeleted, cancellationToken)
            ?? throw new AppException(ErrorCodes.PaymentTypeNotFound, "Payment type not found.", 404);

        await _shopMembershipService.EnsureCurrentUserShopRoleAsync(entity.ShopId, EditorRoles, cancellationToken);

        entity.IsDeleted = true;
        entity.IsActive = false;
        entity.ModifiedOn = DateTimeOffset.UtcNow;
        entity.ModifiedBy = _currentUserService.UserId;

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        InvalidateCache(entity.ShopId);

        await _auditService.LogAsync(nameof(ShopPaymentType), entity.Id, "ShopPaymentTypeDeleted", entity.ShopId, cancellationToken: cancellationToken);
    }

    private static readonly (string Name, string Keywords)[] DefaultPaymentTypes =
    [
        ("Cash", "cash"),
        ("Card", "card, visa, mastercard, contactless, chip & pin"),
        ("Credit Card", "credit"),
        ("Fuel Card", "fuel, bp, shell, allstar, keyfuels"),
        ("Cheque", "cheque, check")
    ];

    public async Task<IReadOnlyCollection<ShopPaymentTypeDto>> SeedDefaultsAsync(Guid shopId, CancellationToken cancellationToken = default)
    {
        await _shopMembershipService.EnsureCurrentUserShopRoleAsync(shopId, EditorRoles, cancellationToken);

        var existingNames = await _repository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && !x.IsDeleted)
            .Select(x => x.Name)
            .ToListAsync(cancellationToken);

        var existing = new HashSet<string>(existingNames, StringComparer.OrdinalIgnoreCase);
        var now = DateTimeOffset.UtcNow;
        var userId = _currentUserService.UserId;
        var sortOrder = 1;
        var inserted = new List<ShopPaymentType>();

        foreach (var (name, keywords) in DefaultPaymentTypes)
        {
            if (existing.Contains(name))
            {
                sortOrder++;
                continue;
            }

            var entity = new ShopPaymentType
            {
                ShopId = shopId,
                Name = name,
                Keywords = keywords,
                SortOrder = sortOrder++,
                IsActive = true,
                CreatedOn = now,
                CreatedBy = userId
            };

            await _repository.AddAsync(entity, cancellationToken);
            inserted.Add(entity);
        }

        if (inserted.Count > 0)
        {
            await _unitOfWork.SaveChangesAsync(cancellationToken);
            InvalidateCache(shopId);
            foreach (var entity in inserted)
            {
                await _auditService.LogAsync(nameof(ShopPaymentType), entity.Id, "ShopPaymentTypeSeeded", entity.ShopId, cancellationToken: cancellationToken);
            }
        }

        return await ListAsync(shopId, includeInactive: false, cancellationToken);
    }

    private static string? NullIfBlank(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static ShopPaymentTypeDto Map(ShopPaymentType entity) => new()
    {
        Id = entity.Id,
        ShopId = entity.ShopId,
        Name = entity.Name,
        Code = entity.Code,
        Keywords = entity.Keywords,
        SortOrder = entity.SortOrder,
        IsActive = entity.IsActive
    };
}
