using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.StoreSales;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Entities;

namespace ScratchCard.Application.Services;

public sealed class TillFieldOverrideService : ITillFieldOverrideService
{
    private static readonly string[] ManagementRoles = [RoleNames.CompanyOwner, RoleNames.Manager];

    private readonly IRepository<TillFieldOverride> _overrides;
    private readonly IRepository<ShopServiceCounterConfig> _counterConfigs;
    private readonly IRepository<Shop> _shops;
    private readonly IShopMembershipService _shopMembership;
    private readonly IFeatureGateService _featureGate;
    private readonly ICurrentUserService _currentUser;
    private readonly IUnitOfWork _unitOfWork;

    public TillFieldOverrideService(
        IRepository<TillFieldOverride> overrides,
        IRepository<ShopServiceCounterConfig> counterConfigs,
        IRepository<Shop> shops,
        IShopMembershipService shopMembership,
        IFeatureGateService featureGate,
        ICurrentUserService currentUser,
        IUnitOfWork unitOfWork)
    {
        _overrides = overrides;
        _counterConfigs = counterConfigs;
        _shops = shops;
        _shopMembership = shopMembership;
        _featureGate = featureGate;
        _currentUser = currentUser;
        _unitOfWork = unitOfWork;
    }

    private async Task EnsureAccessAsync(Guid shopId, CancellationToken ct)
    {
        await _shopMembership.EnsureCurrentUserShopRoleAsync(shopId, ManagementRoles, ct);
        await _featureGate.EnsureFeatureAsync(shopId, FeatureKeys.StoreSalesBasic, ct);
    }

    public async Task<IReadOnlyCollection<TillFieldOverrideDto>> ListAsync(Guid shopId, CancellationToken cancellationToken = default)
    {
        await EnsureAccessAsync(shopId, cancellationToken);
        var rows = await _overrides.Query().AsNoTracking()
            .Where(o => o.ShopId == shopId && !o.IsDeleted)
            .ToListAsync(cancellationToken);
        return rows.Select(Map).ToList();
    }

    public async Task<TillFieldOverrideDto> UpsertAsync(UpsertTillFieldOverrideRequest request, CancellationToken cancellationToken = default)
    {
        await EnsureAccessAsync(request.ShopId, cancellationToken);

        var existing = await _overrides.Query()
            .FirstOrDefaultAsync(o => o.ShopId == request.ShopId && o.CanonicalField == request.CanonicalField && !o.IsDeleted, cancellationToken);

        if (existing is null)
        {
            existing = new TillFieldOverride
            {
                ShopId = request.ShopId,
                CanonicalField = request.CanonicalField,
                Group = request.Group,
                Vat = request.Vat,
                LedgerCategory = request.LedgerCategory,
                CreatedOn = DateTimeOffset.UtcNow,
                CreatedBy = _currentUser.UserId,
            };
            await _overrides.AddAsync(existing, cancellationToken);
        }
        else
        {
            existing.Group = request.Group;
            existing.Vat = request.Vat;
            existing.LedgerCategory = request.LedgerCategory;
            existing.ModifiedOn = DateTimeOffset.UtcNow;
            existing.ModifiedBy = _currentUser.UserId;
            _overrides.Update(existing);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return Map(existing);
    }

    public async Task DeleteAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var row = await _overrides.Query().FirstOrDefaultAsync(o => o.Id == id && !o.IsDeleted, cancellationToken)
            ?? throw new AppException("override_not_found", "Field override not found.", 404);
        await EnsureAccessAsync(row.ShopId, cancellationToken);
        row.IsDeleted = true;
        row.ModifiedOn = DateTimeOffset.UtcNow;
        row.ModifiedBy = _currentUser.UserId;
        _overrides.Update(row);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
    }

    public async Task<int> CopyToShopsAsync(CopyTillConfigRequest request, CancellationToken cancellationToken = default)
    {
        await EnsureAccessAsync(request.SourceShopId, cancellationToken);
        var source = await _shops.Query().AsNoTracking().FirstOrDefaultAsync(s => s.Id == request.SourceShopId && !s.IsDeleted, cancellationToken)
            ?? throw new AppException("shop_not_found", "Source shop not found.", 404);

        var targets = await _shops.Query().AsNoTracking()
            .Where(s => request.TargetShopIds.Contains(s.Id) && s.Id != source.Id && !s.IsDeleted && s.CompanyId == source.CompanyId)
            .Select(s => s.Id)
            .ToListAsync(cancellationToken);
        if (targets.Count == 0)
        {
            throw new AppException("no_targets", "No valid target shops in the same company.", 400);
        }

        var srcOverrides = request.IncludeFieldOverrides
            ? await _overrides.Query().AsNoTracking().Where(o => o.ShopId == request.SourceShopId && !o.IsDeleted).ToListAsync(cancellationToken)
            : new List<TillFieldOverride>();
        var srcCounters = request.IncludeCounterConfig
            ? await _counterConfigs.Query().AsNoTracking().Where(c => c.ShopId == request.SourceShopId && !c.IsDeleted).ToListAsync(cancellationToken)
            : new List<ShopServiceCounterConfig>();

        var now = DateTimeOffset.UtcNow;
        var by = _currentUser.UserId;

        foreach (var targetId in targets)
        {
            // Caller must also manage the target shop.
            await _shopMembership.EnsureCurrentUserShopRoleAsync(targetId, ManagementRoles, cancellationToken);

            if (request.IncludeFieldOverrides)
            {
                // Replace the target's overrides with the source's (clean copy).
                var existing = await _overrides.Query().Where(o => o.ShopId == targetId && !o.IsDeleted).ToListAsync(cancellationToken);
                foreach (var e in existing) { e.IsDeleted = true; e.ModifiedOn = now; e.ModifiedBy = by; _overrides.Update(e); }
                foreach (var s in srcOverrides)
                {
                    await _overrides.AddAsync(new TillFieldOverride
                    {
                        ShopId = targetId,
                        CanonicalField = s.CanonicalField,
                        Group = s.Group,
                        Vat = s.Vat,
                        LedgerCategory = s.LedgerCategory,
                        CreatedOn = now,
                        CreatedBy = by,
                    }, cancellationToken);
                }
            }

            if (request.IncludeCounterConfig)
            {
                var existing = await _counterConfigs.Query().Where(c => c.ShopId == targetId && !c.IsDeleted).ToListAsync(cancellationToken);
                foreach (var e in existing) { e.IsDeleted = true; e.ModifiedOn = now; e.ModifiedBy = by; _counterConfigs.Update(e); }
                foreach (var s in srcCounters)
                {
                    await _counterConfigs.AddAsync(new ShopServiceCounterConfig
                    {
                        ShopId = targetId,
                        CounterType = s.CounterType,
                        IsEnabled = s.IsEnabled,
                        Variant = s.Variant,
                        AffectsRetailDrawer = s.AffectsRetailDrawer,
                        Settlement = s.Settlement,
                        CommissionRate = s.CommissionRate,
                        CreatedOn = now,
                        CreatedBy = by,
                    }, cancellationToken);
                }
            }
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return targets.Count;
    }

    private static TillFieldOverrideDto Map(TillFieldOverride o)
    {
        var meta = TillCanonicalCatalogue.Meta(o.CanonicalField);
        return new TillFieldOverrideDto
        {
            Id = o.Id,
            ShopId = o.ShopId,
            CanonicalField = o.CanonicalField,
            FieldName = meta.DisplayName,
            Group = o.Group,
            Vat = o.Vat,
            LedgerCategory = o.LedgerCategory,
            DefaultGroup = meta.Group,
            DefaultVat = meta.Vat,
            DefaultLedgerCategory = TillAccountingCatalogue.LedgerFor(o.CanonicalField),
        };
    }
}
