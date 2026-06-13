using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Helpers;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.StoreSales;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Entities;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.Services;

/// <summary>Manages the global, data-driven till-field catalogue and refreshes the in-memory cache.</summary>
public sealed class TillFieldDefinitionService : ITillFieldDefinitionService
{
    private readonly IRepository<TillFieldDefinition> _defs;
    private readonly IRepository<TillFieldAlias> _aliases;
    private readonly ICurrentUserService _currentUser;
    private readonly IUnitOfWork _unitOfWork;

    public TillFieldDefinitionService(
        IRepository<TillFieldDefinition> defs,
        IRepository<TillFieldAlias> aliases,
        ICurrentUserService currentUser,
        IUnitOfWork unitOfWork)
    {
        _defs = defs;
        _aliases = aliases;
        _currentUser = currentUser;
        _unitOfWork = unitOfWork;
    }

    public async Task<IReadOnlyCollection<TillFieldDefinitionDto>> ListAsync(CancellationToken cancellationToken = default)
    {
        var rows = await _defs.Query().AsNoTracking().OrderBy(x => x.SortOrder).ThenBy(x => x.DisplayName).ToListAsync(cancellationToken);
        return rows.Select(Map).ToList();
    }

    public async Task<IReadOnlyCollection<TillFieldDefinitionDto>> ListActiveAsync(Guid? shopId = null, CancellationToken cancellationToken = default)
    {
        // Global built-ins (ShopId null) plus this shop's own custom fields — never another shop's.
        var rows = await _defs.Query().AsNoTracking()
            .Where(x => x.IsActive && (x.ShopId == null || x.ShopId == shopId))
            .OrderBy(x => x.SortOrder).ThenBy(x => x.DisplayName).ToListAsync(cancellationToken);
        return rows.Select(Map).ToList();
    }

    public async Task<TillFieldDefinitionDto> CreateAsync(CreateTillFieldDefinitionRequest request, CancellationToken cancellationToken = default)
    {
        var code = (request.Code ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(code) || !System.Text.RegularExpressions.Regex.IsMatch(code, "^[A-Za-z][A-Za-z0-9]{1,59}$"))
            throw new AppException("invalid_code", "Code must be alphanumeric (letters/digits), starting with a letter.", 400);
        if (await _defs.Query().AnyAsync(d => d.Code == code, cancellationToken))
            throw new AppException("duplicate_code", $"A field with code '{code}' already exists.", 409);

        var maxOrder = await _defs.Query().AsNoTracking().Select(d => (int?)d.SortOrder).MaxAsync(cancellationToken) ?? 0;
        var def = new TillFieldDefinition
        {
            Code = code,
            DisplayName = string.IsNullOrWhiteSpace(request.DisplayName) ? code : request.DisplayName.Trim(),
            Group = request.Group,
            CashDirection = request.CashDirection,
            AffectsDrawer = request.AffectsDrawer,
            Vat = request.Vat,
            IsCommissionIncome = request.IsCommissionIncome,
            DefaultLedger = request.DefaultLedger,
            SortOrder = maxOrder + 1,
            IsBuiltIn = false,
            IsActive = true,
            CreatedOn = DateTimeOffset.UtcNow,
            CreatedBy = _currentUser.UserId,
        };
        await _defs.AddAsync(def, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        await ReloadAsync(cancellationToken);
        return Map(def);
    }

    public async Task<TillFieldDefinitionDto> UpdateAsync(UpdateTillFieldDefinitionRequest request, CancellationToken cancellationToken = default)
    {
        var def = await _defs.Query().FirstOrDefaultAsync(x => x.Code == request.Code, cancellationToken)
            ?? throw new AppException("definition_not_found", $"Till field '{request.Code}' not found.", 404);

        def.DisplayName = request.DisplayName.Trim();
        def.Group = request.Group;
        def.CashDirection = request.CashDirection;
        def.AffectsDrawer = request.AffectsDrawer;
        def.Vat = request.Vat;
        def.IsCommissionIncome = request.IsCommissionIncome;
        def.DefaultLedger = request.DefaultLedger;
        def.IsActive = request.IsActive;
        def.ModifiedOn = DateTimeOffset.UtcNow;
        def.ModifiedBy = _currentUser.UserId;
        _defs.Update(def);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await ReloadAsync(cancellationToken);
        return Map(def);
    }

    /// <summary>Rebuild the in-memory catalogue + ledger caches from the table.</summary>
    public async Task ReloadAsync(CancellationToken cancellationToken = default)
    {
        var rows = await _defs.Query().AsNoTracking().Where(x => x.IsActive).ToListAsync(cancellationToken);
        var metas = new Dictionary<string, TillFieldMeta>(StringComparer.OrdinalIgnoreCase);
        var ledgers = new Dictionary<string, LedgerCategory>(StringComparer.OrdinalIgnoreCase);
        foreach (var r in rows)
        {
            var field = Enum.TryParse<TillCanonicalField>(r.Code, out var f) ? f : TillCanonicalField.Unmapped;
            metas[r.Code] = new TillFieldMeta(r.Code, field, r.Group, r.CashDirection, r.AffectsDrawer, r.Vat, r.IsCommissionIncome, r.DisplayName, string.IsNullOrWhiteSpace(r.GroupCode) ? r.Group.ToString() : r.GroupCode);
            ledgers[r.Code] = r.DefaultLedger;
        }
        TillCanonicalCatalogue.LoadRuntime(metas);
        TillAccountingCatalogue.LoadRuntimeLedger(ledgers);

        var aliasRows = await _aliases.Query().AsNoTracking().ToListAsync(cancellationToken);
        var aliasMap = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var a in aliasRows) aliasMap[a.NormalizedAlias] = a.Code;
        TillAliasDictionary.LoadRuntime(aliasMap);
    }

    public async Task<IReadOnlyCollection<TillFieldAliasDto>> ListAliasesAsync(CancellationToken cancellationToken = default)
    {
        var rows = await _aliases.Query().AsNoTracking().OrderBy(x => x.Code).ThenBy(x => x.NormalizedAlias).ToListAsync(cancellationToken);
        return rows.Select(a => new TillFieldAliasDto { Id = a.Id, NormalizedAlias = a.NormalizedAlias, Code = a.Code }).ToList();
    }

    public async Task<TillFieldAliasDto> AddAliasAsync(AddTillFieldAliasRequest request, CancellationToken cancellationToken = default)
    {
        if (!await _defs.Query().AnyAsync(d => d.Code == request.Code, cancellationToken))
            throw new AppException("definition_not_found", $"Till field '{request.Code}' not found.", 404);

        var normalized = TillLabelNormalizer.Normalize(request.Alias);
        if (string.IsNullOrWhiteSpace(normalized))
            throw new AppException("invalid_alias", "Alias is empty after normalization.", 400);

        var existing = await _aliases.Query().FirstOrDefaultAsync(a => a.NormalizedAlias == normalized, cancellationToken);
        if (existing is null)
        {
            existing = new TillFieldAlias { NormalizedAlias = normalized, Code = request.Code, CreatedOn = DateTimeOffset.UtcNow, CreatedBy = _currentUser.UserId };
            await _aliases.AddAsync(existing, cancellationToken);
        }
        else
        {
            existing.Code = request.Code; // re-point an existing alias
            existing.ModifiedOn = DateTimeOffset.UtcNow;
            existing.ModifiedBy = _currentUser.UserId;
            _aliases.Update(existing);
        }
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        await ReloadAsync(cancellationToken);
        return new TillFieldAliasDto { Id = existing.Id, NormalizedAlias = existing.NormalizedAlias, Code = existing.Code };
    }

    public async Task DeleteAliasAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var row = await _aliases.Query().FirstOrDefaultAsync(a => a.Id == id, cancellationToken)
            ?? throw new AppException("alias_not_found", "Alias not found.", 404);
        _aliases.Remove(row);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        await ReloadAsync(cancellationToken);
    }

    private static TillFieldDefinitionDto Map(TillFieldDefinition d) => new()
    {
        Id = d.Id,
        Code = d.Code,
        DisplayName = d.DisplayName,
        Group = d.Group,
        GroupCode = string.IsNullOrWhiteSpace(d.GroupCode) ? d.Group.ToString() : d.GroupCode,
        GroupName = TillGroupCatalogue.ByCode.TryGetValue(string.IsNullOrWhiteSpace(d.GroupCode) ? d.Group.ToString() : d.GroupCode, out var gm) ? gm.DisplayName : (string.IsNullOrWhiteSpace(d.GroupCode) ? d.Group.ToString() : d.GroupCode),
        CashDirection = d.CashDirection,
        AffectsDrawer = d.AffectsDrawer,
        Vat = d.Vat,
        IsCommissionIncome = d.IsCommissionIncome,
        DefaultLedger = d.DefaultLedger,
        SortOrder = d.SortOrder,
        IsBuiltIn = d.IsBuiltIn,
        IsActive = d.IsActive,
    };
}
