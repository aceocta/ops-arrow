using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.StoreSales;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Entities;

namespace ScratchCard.Application.Services;

public class TillService : ITillService
{
    private static readonly string[] EditorRoles =
        [RoleNames.CompanyOwner, RoleNames.Manager];

    private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(5);

    private readonly IRepository<Till> _tillRepository;
    private readonly IShopMembershipService _shopMembershipService;
    private readonly ICurrentUserService _currentUserService;
    private readonly IAuditService _auditService;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IMemoryCache _cache;

    public TillService(
        IRepository<Till> tillRepository,
        IShopMembershipService shopMembershipService,
        ICurrentUserService currentUserService,
        IAuditService auditService,
        IUnitOfWork unitOfWork,
        IMemoryCache cache)
    {
        _tillRepository = tillRepository;
        _shopMembershipService = shopMembershipService;
        _currentUserService = currentUserService;
        _auditService = auditService;
        _unitOfWork = unitOfWork;
        _cache = cache;
    }

    private static string ActiveListCacheKey(Guid shopId) => $"tills:active:{shopId}";
    private void InvalidateCache(Guid shopId) => _cache.Remove(ActiveListCacheKey(shopId));

    public async Task<IReadOnlyCollection<TillDto>> ListAsync(Guid shopId, bool includeInactive, CancellationToken cancellationToken = default)
    {
        await _shopMembershipService.EnsureCurrentUserShopRoleAsync(shopId, RoleNames.All, cancellationToken);

        if (!includeInactive
            && _cache.TryGetValue<IReadOnlyCollection<TillDto>>(ActiveListCacheKey(shopId), out var cached)
            && cached is not null)
        {
            return cached;
        }

        var query = _tillRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && !x.IsDeleted);

        if (!includeInactive)
        {
            query = query.Where(x => x.IsActive);
        }

        var tills = await query
            .OrderBy(x => x.Name)
            .ToListAsync(cancellationToken);

        var dto = tills.Select(Map).ToArray();
        if (!includeInactive)
        {
            _cache.Set(ActiveListCacheKey(shopId), (IReadOnlyCollection<TillDto>)dto, CacheTtl);
        }
        return dto;
    }

    public async Task<TillDto> CreateAsync(CreateTillRequest request, CancellationToken cancellationToken = default)
    {
        await _shopMembershipService.EnsureCurrentUserShopRoleAsync(request.ShopId, EditorRoles, cancellationToken);

        var name = request.Name.Trim();
        var nameTaken = await _tillRepository.Query()
            .AnyAsync(x => x.ShopId == request.ShopId && !x.IsDeleted && x.Name == name, cancellationToken);
        if (nameTaken)
        {
            throw new AppException(ErrorCodes.DuplicateTillName, $"A till named '{name}' already exists for this shop.");
        }

        var till = new Till
        {
            ShopId = request.ShopId,
            Name = name,
            Code = string.IsNullOrWhiteSpace(request.Code) ? null : request.Code.Trim(),
            IsActive = true,
            CreatedOn = DateTimeOffset.UtcNow,
            CreatedBy = _currentUserService.UserId
        };

        await _tillRepository.AddAsync(till, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        InvalidateCache(till.ShopId);

        await _auditService.LogAsync(nameof(Till), till.Id, "TillCreated", till.ShopId, cancellationToken: cancellationToken);

        return Map(till);
    }

    public async Task<TillDto> UpdateAsync(Guid id, UpdateTillRequest request, CancellationToken cancellationToken = default)
    {
        var till = await _tillRepository.Query()
            .FirstOrDefaultAsync(x => x.Id == id && !x.IsDeleted, cancellationToken)
            ?? throw new AppException(ErrorCodes.TillNotFound, "Till not found.", 404);

        await _shopMembershipService.EnsureCurrentUserShopRoleAsync(till.ShopId, EditorRoles, cancellationToken);

        var name = request.Name.Trim();
        if (!string.Equals(till.Name, name, StringComparison.OrdinalIgnoreCase))
        {
            var nameTaken = await _tillRepository.Query()
                .AnyAsync(x => x.ShopId == till.ShopId && x.Id != id && !x.IsDeleted && x.Name == name, cancellationToken);
            if (nameTaken)
            {
                throw new AppException(ErrorCodes.DuplicateTillName, $"A till named '{name}' already exists for this shop.");
            }
        }

        till.Name = name;
        till.Code = string.IsNullOrWhiteSpace(request.Code) ? null : request.Code.Trim();
        till.IsActive = request.IsActive;
        till.ModifiedOn = DateTimeOffset.UtcNow;
        till.ModifiedBy = _currentUserService.UserId;

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        InvalidateCache(till.ShopId);

        await _auditService.LogAsync(nameof(Till), till.Id, "TillUpdated", till.ShopId, cancellationToken: cancellationToken);

        return Map(till);
    }

    public async Task DeleteAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var till = await _tillRepository.Query()
            .FirstOrDefaultAsync(x => x.Id == id && !x.IsDeleted, cancellationToken)
            ?? throw new AppException(ErrorCodes.TillNotFound, "Till not found.", 404);

        await _shopMembershipService.EnsureCurrentUserShopRoleAsync(till.ShopId, EditorRoles, cancellationToken);

        // Soft delete keeps historical till reports' Till linkage intact for reporting.
        till.IsDeleted = true;
        till.IsActive = false;
        till.ModifiedOn = DateTimeOffset.UtcNow;
        till.ModifiedBy = _currentUserService.UserId;

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        InvalidateCache(till.ShopId);

        await _auditService.LogAsync(nameof(Till), till.Id, "TillDeleted", till.ShopId, cancellationToken: cancellationToken);
    }

    private static TillDto Map(Till till) => new()
    {
        Id = till.Id,
        ShopId = till.ShopId,
        Name = till.Name,
        Code = till.Code,
        IsActive = till.IsActive
    };
}
