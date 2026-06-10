using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Services;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Entities;

namespace ScratchCard.Application.Services;

public sealed class TillReportDefaultsService : ITillReportDefaultsService
{
    private static readonly string[] ManagementRoles = [RoleNames.CompanyOwner, RoleNames.Manager];

    private static readonly (string Name, string Keywords)[] DefaultPaymentTypes =
    [
        ("Cash", "cash"),
        ("Card", "card, visa, mastercard, contactless, chip & pin"),
        ("Credit Card", "credit"),
        ("Fuel Card", "fuel, bp, shell, allstar, keyfuels"),
        ("Cheque", "cheque, check"),
    ];

    private readonly IRepository<ShopPaymentType> _paymentTypes;
    private readonly IRepository<Till> _tills;
    private readonly IRepository<Shop> _shops;
    private readonly IShopMembershipService _shopMembership;
    private readonly ICurrentUserService _currentUser;
    private readonly IUnitOfWork _unitOfWork;

    public TillReportDefaultsService(
        IRepository<ShopPaymentType> paymentTypes,
        IRepository<Till> tills,
        IRepository<Shop> shops,
        IShopMembershipService shopMembership,
        ICurrentUserService currentUser,
        IUnitOfWork unitOfWork)
    {
        _paymentTypes = paymentTypes;
        _tills = tills;
        _shops = shops;
        _shopMembership = shopMembership;
        _currentUser = currentUser;
        _unitOfWork = unitOfWork;
    }

    public async Task SeedDefaultsAsync(Guid shopId, CancellationToken cancellationToken = default)
    {
        var now = DateTimeOffset.UtcNow;
        var by = _currentUser.UserId;

        // Default payment types — only if the shop has none yet (idempotent).
        if (!await _paymentTypes.Query().AnyAsync(p => p.ShopId == shopId && !p.IsDeleted, cancellationToken))
        {
            var order = 1;
            foreach (var (name, keywords) in DefaultPaymentTypes)
            {
                await _paymentTypes.AddAsync(new ShopPaymentType
                {
                    ShopId = shopId,
                    Name = name,
                    Keywords = keywords,
                    SortOrder = order++,
                    IsActive = true,
                    CreatedOn = now,
                    CreatedBy = by,
                }, cancellationToken);
            }
        }

        // A default till so reconciliation has somewhere to land — only if none exists.
        if (!await _tills.Query().AnyAsync(t => t.ShopId == shopId && !t.IsDeleted, cancellationToken))
        {
            await _tills.AddAsync(new Till
            {
                ShopId = shopId,
                Name = "Till 1",
                IsActive = true,
                DefaultFloat = 0m,
                CreatedOn = now,
                CreatedBy = by,
            }, cancellationToken);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);
    }

    public async Task<int> ApplyAsync(Guid? shopId, Guid? companyId, CancellationToken cancellationToken = default)
    {
        if (shopId is { } sid)
        {
            await _shopMembership.EnsureCurrentUserShopRoleAsync(sid, ManagementRoles, cancellationToken);
            await SeedDefaultsAsync(sid, cancellationToken);
            return 1;
        }

        if (companyId is { } cid)
        {
            var shopIds = await _shops.Query().AsNoTracking()
                .Where(s => s.CompanyId == cid && !s.IsDeleted)
                .Select(s => s.Id)
                .ToListAsync(cancellationToken);

            var count = 0;
            foreach (var id in shopIds)
            {
                // Skip shops the caller doesn't manage rather than failing the whole batch.
                try { await _shopMembership.EnsureCurrentUserShopRoleAsync(id, ManagementRoles, cancellationToken); }
                catch { continue; }
                await SeedDefaultsAsync(id, cancellationToken);
                count++;
            }
            return count;
        }

        throw new AppException("no_target", "Provide a shopId or companyId.", 400);
    }
}
