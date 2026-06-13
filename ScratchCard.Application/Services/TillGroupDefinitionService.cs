using System.Text;
using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.StoreSales;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Entities;

namespace ScratchCard.Application.Services;

/// <summary>Per-shop custom reconciliation groups, layered over the global built-ins.</summary>
public sealed class TillGroupDefinitionService : ITillGroupDefinitionService
{
    private static readonly string[] ManagementRoles = [RoleNames.CompanyOwner, RoleNames.Manager];

    private readonly IRepository<TillGroupDefinition> _groups;
    private readonly IRepository<TillFieldOverride> _fieldOverrides;
    private readonly IShopMembershipService _shopMembership;
    private readonly IFeatureGateService _featureGate;
    private readonly ICurrentUserService _currentUser;
    private readonly IUnitOfWork _unitOfWork;

    public TillGroupDefinitionService(
        IRepository<TillGroupDefinition> groups,
        IRepository<TillFieldOverride> fieldOverrides,
        IShopMembershipService shopMembership,
        IFeatureGateService featureGate,
        ICurrentUserService currentUser,
        IUnitOfWork unitOfWork)
    {
        _groups = groups;
        _fieldOverrides = fieldOverrides;
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

    public async Task<IReadOnlyCollection<TillGroupDto>> ListAsync(Guid shopId, CancellationToken cancellationToken = default)
    {
        await EnsureAccessAsync(shopId, cancellationToken);

        var custom = await _groups.Query().AsNoTracking()
            .Where(g => g.ShopId == shopId && !g.IsDeleted)
            .ToListAsync(cancellationToken);

        // Built-ins come from the catalogue constant (the seeded global rows mirror it) so the list is
        // stable even before seeding has run; the shop's customs are layered on top.
        var builtIns = TillGroupCatalogue.Defaults.Select(g => new TillGroupDto
        {
            Id = Guid.Empty,
            ShopId = null,
            Code = g.Code,
            DisplayName = g.DisplayName,
            SortOrder = g.SortOrder,
            IsActive = true,
            IsBuiltIn = true,
        });

        return builtIns
            .Concat(custom.Select(Map))
            .OrderBy(g => g.SortOrder).ThenBy(g => g.DisplayName)
            .ToList();
    }

    public async Task<TillGroupDto> CreateAsync(CreateTillGroupRequest request, CancellationToken cancellationToken = default)
    {
        await EnsureAccessAsync(request.ShopId, cancellationToken);

        var name = (request.DisplayName ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(name))
            throw new AppException("invalid_name", "Group name is required.", 400);

        var taken = await TakenCodesAsync(request.ShopId, cancellationToken);
        var code = UniqueCode(name, taken);

        var maxOrder = await _groups.Query().AsNoTracking()
            .Where(g => g.ShopId == request.ShopId && !g.IsDeleted)
            .Select(g => (int?)g.SortOrder).MaxAsync(cancellationToken) ?? 0;
        var builtInMax = TillGroupCatalogue.Defaults.Max(g => g.SortOrder);

        var group = new TillGroupDefinition
        {
            ShopId = request.ShopId,
            Code = code,
            DisplayName = name,
            // Default new groups after everything else so they don't reshuffle existing sections.
            SortOrder = request.SortOrder ?? Math.Max(maxOrder, builtInMax) + 10,
            IsActive = true,
            IsBuiltIn = false,
            CreatedOn = DateTimeOffset.UtcNow,
            CreatedBy = _currentUser.UserId,
        };
        await _groups.AddAsync(group, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return Map(group);
    }

    public async Task<TillGroupDto> UpdateAsync(UpdateTillGroupRequest request, CancellationToken cancellationToken = default)
    {
        var group = await _groups.Query().FirstOrDefaultAsync(g => g.Id == request.Id && !g.IsDeleted, cancellationToken)
            ?? throw new AppException("group_not_found", "Group not found.", 404);
        if (group.ShopId is null || group.IsBuiltIn)
            throw new AppException("group_readonly", "Built-in groups can't be edited.", 400);
        await EnsureAccessAsync(group.ShopId.Value, cancellationToken);

        var name = (request.DisplayName ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(name))
            throw new AppException("invalid_name", "Group name is required.", 400);

        group.DisplayName = name;
        group.SortOrder = request.SortOrder;
        group.IsActive = request.IsActive;
        group.ModifiedOn = DateTimeOffset.UtcNow;
        group.ModifiedBy = _currentUser.UserId;
        _groups.Update(group);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return Map(group);
    }

    public async Task DeleteAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var group = await _groups.Query().FirstOrDefaultAsync(g => g.Id == id && !g.IsDeleted, cancellationToken)
            ?? throw new AppException("group_not_found", "Group not found.", 404);
        if (group.ShopId is null || group.IsBuiltIn)
            throw new AppException("group_readonly", "Built-in groups can't be deleted.", 400);
        await EnsureAccessAsync(group.ShopId.Value, cancellationToken);

        // Revert any fields assigned to this group back to their default group, so their lines don't
        // land in an orphaned section after the group is gone.
        var assigned = await _fieldOverrides.Query()
            .Where(o => o.ShopId == group.ShopId && o.GroupCode == group.Code && !o.IsDeleted)
            .ToListAsync(cancellationToken);
        foreach (var o in assigned)
        {
            o.GroupCode = null;
            o.ModifiedOn = DateTimeOffset.UtcNow;
            o.ModifiedBy = _currentUser.UserId;
            _fieldOverrides.Update(o);
        }

        group.IsDeleted = true;
        group.ModifiedOn = DateTimeOffset.UtcNow;
        group.ModifiedBy = _currentUser.UserId;
        _groups.Update(group);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
    }

    private async Task<HashSet<string>> TakenCodesAsync(Guid shopId, CancellationToken ct)
    {
        var shopCodes = await _groups.Query().AsNoTracking()
            .Where(g => g.ShopId == shopId && !g.IsDeleted)
            .Select(g => g.Code)
            .ToListAsync(ct);
        var taken = new HashSet<string>(TillGroupCatalogue.Defaults.Select(g => g.Code), StringComparer.OrdinalIgnoreCase);
        foreach (var c in shopCodes) taken.Add(c);
        return taken;
    }

    /// <summary>Stable code from a display name: alphanumeric, letter-first, unique within the shop.</summary>
    private static string UniqueCode(string name, HashSet<string> taken)
    {
        var sb = new StringBuilder();
        foreach (var ch in name)
        {
            if (char.IsLetterOrDigit(ch)) sb.Append(ch);
        }
        var baseCode = sb.ToString();
        if (baseCode.Length == 0 || !char.IsLetter(baseCode[0])) baseCode = "Grp" + baseCode;
        if (baseCode.Length > 50) baseCode = baseCode[..50];

        var code = baseCode;
        var n = 2;
        while (taken.Contains(code)) code = $"{baseCode}{n++}";
        return code;
    }

    private static TillGroupDto Map(TillGroupDefinition g) => new()
    {
        Id = g.Id,
        ShopId = g.ShopId,
        Code = g.Code,
        DisplayName = g.DisplayName,
        SortOrder = g.SortOrder,
        IsActive = g.IsActive,
        IsBuiltIn = g.IsBuiltIn,
    };
}
