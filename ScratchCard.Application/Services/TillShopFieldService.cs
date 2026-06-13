using System.Text;
using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.StoreSales;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Entities;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.Services;

/// <summary>A shop's own custom till fields. Cash behaviour is constrained to In/Out/None so a
/// shopkeeper can't mis-set raw drawer flags. Custom fields resolve through the same global runtime
/// cache as built-ins (codes are globally unique), so proof-of-cash picks them up automatically.</summary>
public sealed class TillShopFieldService : ITillShopFieldService
{
    private static readonly string[] ManagementRoles = [RoleNames.CompanyOwner, RoleNames.Manager];

    private readonly IRepository<TillFieldDefinition> _defs;
    private readonly IShopMembershipService _shopMembership;
    private readonly IFeatureGateService _featureGate;
    private readonly ICurrentUserService _currentUser;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ITillFieldDefinitionService _catalogue;

    public TillShopFieldService(
        IRepository<TillFieldDefinition> defs,
        IShopMembershipService shopMembership,
        IFeatureGateService featureGate,
        ICurrentUserService currentUser,
        IUnitOfWork unitOfWork,
        ITillFieldDefinitionService catalogue)
    {
        _defs = defs;
        _shopMembership = shopMembership;
        _featureGate = featureGate;
        _currentUser = currentUser;
        _unitOfWork = unitOfWork;
        _catalogue = catalogue;
    }

    private async Task EnsureAccessAsync(Guid shopId, CancellationToken ct)
    {
        await _shopMembership.EnsureCurrentUserShopRoleAsync(shopId, ManagementRoles, ct);
        await _featureGate.EnsureFeatureAsync(shopId, FeatureKeys.StoreSalesBasic, ct);
    }

    public async Task<IReadOnlyCollection<TillShopFieldDto>> ListAsync(Guid shopId, CancellationToken cancellationToken = default)
    {
        await EnsureAccessAsync(shopId, cancellationToken);
        var rows = await _defs.Query().AsNoTracking()
            .Where(x => x.ShopId == shopId && x.IsActive)
            .OrderBy(x => x.DisplayName)
            .ToListAsync(cancellationToken);
        return rows.Select(Map).ToList();
    }

    public async Task<TillShopFieldDto> CreateAsync(CreateTillShopFieldRequest request, CancellationToken cancellationToken = default)
    {
        await EnsureAccessAsync(request.ShopId, cancellationToken);

        var name = (request.DisplayName ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(name))
            throw new AppException("invalid_name", "Field name is required.", 400);

        var (direction, affects) = MapEffect(request.CashEffect);
        var taken = await _defs.Query().AsNoTracking().Select(d => d.Code).ToListAsync(cancellationToken);
        var code = UniqueCode(name, new HashSet<string>(taken, StringComparer.OrdinalIgnoreCase));

        var maxOrder = await _defs.Query().AsNoTracking().Select(d => (int?)d.SortOrder).MaxAsync(cancellationToken) ?? 0;
        var def = new TillFieldDefinition
        {
            ShopId = request.ShopId,
            Code = code,
            DisplayName = name,
            Group = TillFieldGroup.Movement, // neutral default; GroupCode drives the displayed section.
            GroupCode = string.IsNullOrWhiteSpace(request.GroupCode) ? nameof(TillFieldGroup.Movement) : request.GroupCode.Trim(),
            CashDirection = direction,
            AffectsDrawer = affects,
            Vat = TillVatTreatment.NotApplicable,
            IsCommissionIncome = false,
            DefaultLedger = LedgerCategory.Memo,
            SortOrder = maxOrder + 1,
            IsBuiltIn = false,
            IsActive = true,
            CreatedOn = DateTimeOffset.UtcNow,
            CreatedBy = _currentUser.UserId,
        };
        await _defs.AddAsync(def, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        await _catalogue.ReloadAsync(cancellationToken);
        return Map(def);
    }

    public async Task<TillShopFieldDto> UpdateAsync(UpdateTillShopFieldRequest request, CancellationToken cancellationToken = default)
    {
        var def = await _defs.Query().FirstOrDefaultAsync(x => x.Id == request.Id, cancellationToken)
            ?? throw new AppException("field_not_found", "Field not found.", 404);
        if (def.ShopId is null || def.IsBuiltIn)
            throw new AppException("field_readonly", "Built-in fields can't be edited here.", 400);
        await EnsureAccessAsync(def.ShopId.Value, cancellationToken);

        var name = (request.DisplayName ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(name))
            throw new AppException("invalid_name", "Field name is required.", 400);

        var (direction, affects) = MapEffect(request.CashEffect);
        def.DisplayName = name;
        def.GroupCode = string.IsNullOrWhiteSpace(request.GroupCode) ? nameof(TillFieldGroup.Movement) : request.GroupCode.Trim();
        def.CashDirection = direction;
        def.AffectsDrawer = affects;
        def.IsActive = request.IsActive;
        def.ModifiedOn = DateTimeOffset.UtcNow;
        def.ModifiedBy = _currentUser.UserId;
        _defs.Update(def);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        await _catalogue.ReloadAsync(cancellationToken);
        return Map(def);
    }

    public async Task DeleteAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var def = await _defs.Query().FirstOrDefaultAsync(x => x.Id == id, cancellationToken)
            ?? throw new AppException("field_not_found", "Field not found.", 404);
        if (def.ShopId is null || def.IsBuiltIn)
            throw new AppException("field_readonly", "Built-in fields can't be deleted here.", 400);
        await EnsureAccessAsync(def.ShopId.Value, cancellationToken);

        // Deactivate rather than hard-delete so any past reconciliation lines using the code still resolve.
        def.IsActive = false;
        def.ModifiedOn = DateTimeOffset.UtcNow;
        def.ModifiedBy = _currentUser.UserId;
        _defs.Update(def);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        await _catalogue.ReloadAsync(cancellationToken);
    }

    private static (TillCashDirection Direction, bool Affects) MapEffect(string? effect) => (effect ?? "None").Trim().ToLowerInvariant() switch
    {
        "in" => (TillCashDirection.In, true),
        "out" => (TillCashDirection.Out, true),
        _ => (TillCashDirection.None, false),
    };

    private static string EffectOf(TillFieldDefinition d) =>
        !d.AffectsDrawer ? "None" : d.CashDirection == TillCashDirection.In ? "In" : d.CashDirection == TillCashDirection.Out ? "Out" : "None";

    /// <summary>Stable, globally-unique code from a display name (letters/digits, letter-first).</summary>
    private static string UniqueCode(string name, HashSet<string> taken)
    {
        var sb = new StringBuilder();
        foreach (var ch in name) if (char.IsLetterOrDigit(ch)) sb.Append(ch);
        var baseCode = sb.ToString();
        if (baseCode.Length == 0 || !char.IsLetter(baseCode[0])) baseCode = "Fld" + baseCode;
        if (baseCode.Length > 50) baseCode = baseCode[..50];
        var code = baseCode;
        var n = 2;
        while (taken.Contains(code)) code = $"{baseCode}{n++}";
        return code;
    }

    private static TillShopFieldDto Map(TillFieldDefinition d) => new()
    {
        Id = d.Id,
        ShopId = d.ShopId,
        Code = d.Code,
        DisplayName = d.DisplayName,
        GroupCode = string.IsNullOrWhiteSpace(d.GroupCode) ? d.Group.ToString() : d.GroupCode,
        CashEffect = EffectOf(d),
        IsActive = d.IsActive,
    };
}
