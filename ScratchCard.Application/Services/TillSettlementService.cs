using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.StoreSales;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Entities;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.Services;

public sealed class TillSettlementService : ITillSettlementService
{
    private const decimal PostOfficeTolerance = 5m;     // £ tolerance for PO over/short banding
    private const decimal SettlementTolerance = 1m;     // £ tolerance for DD-vs-captured matching
    private static readonly string[] ManagementRoles = [RoleNames.CompanyOwner, RoleNames.Manager];

    private readonly IRepository<PostOfficeBalance> _postOffice;
    private readonly IRepository<ProviderSettlement> _settlements;
    private readonly IRepository<TillReconciliation> _reconciliations;
    private readonly IShopMembershipService _shopMembership;
    private readonly IFeatureGateService _featureGate;
    private readonly ICurrentUserService _currentUser;
    private readonly IUnitOfWork _unitOfWork;

    public TillSettlementService(
        IRepository<PostOfficeBalance> postOffice,
        IRepository<ProviderSettlement> settlements,
        IRepository<TillReconciliation> reconciliations,
        IShopMembershipService shopMembership,
        IFeatureGateService featureGate,
        ICurrentUserService currentUser,
        IUnitOfWork unitOfWork)
    {
        _postOffice = postOffice;
        _settlements = settlements;
        _reconciliations = reconciliations;
        _shopMembership = shopMembership;
        _featureGate = featureGate;
        _currentUser = currentUser;
        _unitOfWork = unitOfWork;
    }

    private async Task EnsureAccessAsync(Guid shopId, string feature, CancellationToken ct)
    {
        await _shopMembership.EnsureCurrentUserShopRoleAsync(shopId, ManagementRoles, ct);
        await _featureGate.EnsureFeatureAsync(shopId, feature, ct);
    }

    // ---------- Post Office ----------

    public async Task<PostOfficeBalanceDto> GetOrCreatePostOfficeAsync(GetOrCreatePostOfficeRequest request, CancellationToken cancellationToken = default)
    {
        await EnsureAccessAsync(request.ShopId, FeatureKeys.StoreSalesPostOffice, cancellationToken);
        var existing = await _postOffice.Query()
            .FirstOrDefaultAsync(p => p.ShopId == request.ShopId && p.BusinessDate == request.BusinessDate, cancellationToken);
        if (existing is not null) return MapPo(existing);

        var created = new PostOfficeBalance
        {
            ShopId = request.ShopId,
            BusinessDate = request.BusinessDate,
            Status = TillReconciliationStatus.Draft,
            CreatedOn = DateTimeOffset.UtcNow,
            CreatedBy = _currentUser.UserId,
        };
        await _postOffice.AddAsync(created, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return MapPo(created);
    }

    public async Task<PostOfficeBalanceDto> SavePostOfficeAsync(SavePostOfficeRequest request, CancellationToken cancellationToken = default)
    {
        var po = await LoadPoAsync(request.Id, cancellationToken);
        await EnsureAccessAsync(po.ShopId, FeatureKeys.StoreSalesPostOffice, cancellationToken);
        po.OpeningBalance = request.OpeningBalance;
        po.CashIn = request.CashIn;
        po.CashOut = request.CashOut;
        po.CountedBalance = request.CountedBalance;
        po.Notes = request.Notes;
        po.ExpectedBalance = po.OpeningBalance + po.CashIn - po.CashOut;
        po.Variance = (po.CountedBalance ?? 0) - po.ExpectedBalance;
        if (po.Status == TillReconciliationStatus.Draft && po.CountedBalance is not null)
            po.Status = TillReconciliationStatus.NeedsVerification;
        _postOffice.Update(po);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return MapPo(po);
    }

    public async Task<PostOfficeBalanceDto> SetPostOfficeStatusAsync(Guid id, TillReconciliationStatus status, CancellationToken cancellationToken = default)
    {
        var po = await LoadPoAsync(id, cancellationToken);
        await EnsureAccessAsync(po.ShopId, FeatureKeys.StoreSalesPostOffice, cancellationToken);
        if (status == TillReconciliationStatus.Approved)
        {
            po.ConfirmedByUserId = _currentUser.UserId;
            po.ConfirmedOn = DateTimeOffset.UtcNow;
        }
        po.Status = status;
        _postOffice.Update(po);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return MapPo(po);
    }

    // ---------- Provider settlement ----------

    public async Task<ProviderSettlementDto> GetOrCreateSettlementAsync(GetOrCreateSettlementRequest request, CancellationToken cancellationToken = default)
    {
        await EnsureAccessAsync(request.ShopId, FeatureKeys.StoreSalesSettlement, cancellationToken);
        var existing = await _settlements.Query().FirstOrDefaultAsync(s =>
            s.ShopId == request.ShopId && s.Provider == request.Provider &&
            s.PeriodStart == request.PeriodStart && s.PeriodEnd == request.PeriodEnd, cancellationToken);
        if (existing is not null)
        {
            await ApplyCapturedAsync(existing, cancellationToken);
            Recompute(existing);
            _settlements.Update(existing);
            await _unitOfWork.SaveChangesAsync(cancellationToken);
            return MapSettlement(existing);
        }

        var created = new ProviderSettlement
        {
            ShopId = request.ShopId,
            Provider = request.Provider,
            PeriodStart = request.PeriodStart,
            PeriodEnd = request.PeriodEnd,
            Status = SettlementStatus.Open,
            CreatedOn = DateTimeOffset.UtcNow,
            CreatedBy = _currentUser.UserId,
        };
        await ApplyCapturedAsync(created, cancellationToken);
        Recompute(created);
        await _settlements.AddAsync(created, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return MapSettlement(created);
    }

    public async Task<ProviderSettlementDto> RefreshCapturedAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var s = await LoadSettlementAsync(id, cancellationToken);
        await EnsureAccessAsync(s.ShopId, FeatureKeys.StoreSalesSettlement, cancellationToken);
        await ApplyCapturedAsync(s, cancellationToken);
        Recompute(s);
        _settlements.Update(s);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return MapSettlement(s);
    }

    public async Task<ProviderSettlementDto> SetStatementAsync(SetStatementRequest request, CancellationToken cancellationToken = default)
    {
        var s = await LoadSettlementAsync(request.Id, cancellationToken);
        await EnsureAccessAsync(s.ShopId, FeatureKeys.StoreSalesSettlement, cancellationToken);
        s.StatementAmount = request.StatementAmount;
        s.StatementCommission = request.StatementCommission;
        s.DdAmount = request.DdAmount;
        s.DdDate = request.DdDate;
        s.Notes = request.Notes;
        Recompute(s);
        _settlements.Update(s);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return MapSettlement(s);
    }

    public async Task<ProviderSettlementDto> SetSettlementStatusAsync(Guid id, SettlementStatus status, CancellationToken cancellationToken = default)
    {
        var s = await LoadSettlementAsync(id, cancellationToken);
        await EnsureAccessAsync(s.ShopId, FeatureKeys.StoreSalesSettlement, cancellationToken);
        s.Status = status;
        _settlements.Update(s);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return MapSettlement(s);
    }

    public async Task<IReadOnlyCollection<ProviderSettlementDto>> ListSettlementsAsync(Guid shopId, DateOnly from, DateOnly to, CancellationToken cancellationToken = default)
    {
        await EnsureAccessAsync(shopId, FeatureKeys.StoreSalesSettlement, cancellationToken);
        var rows = await _settlements.Query()
            .Where(s => s.ShopId == shopId && s.PeriodEnd >= from && s.PeriodStart <= to)
            .OrderByDescending(s => s.PeriodStart)
            .ToListAsync(cancellationToken);
        return rows.Select(MapSettlement).ToList();
    }

    // ---------- internals ----------

    /// <summary>Sum the relevant canonical line amounts from till reconciliations across the period.</summary>
    private async Task ApplyCapturedAsync(ProviderSettlement s, CancellationToken cancellationToken)
    {
        var lines = await _reconciliations.Query()
            .Where(r => r.ShopId == s.ShopId && r.BusinessDate >= s.PeriodStart && r.BusinessDate <= s.PeriodEnd)
            .SelectMany(r => r.Lines)
            .ToListAsync(cancellationToken);

        decimal Sum(params TillCanonicalField[] fields) => lines.Where(l => fields.Contains(l.CanonicalField)).Sum(l => l.VerifiedAmount);

        switch (s.Provider)
        {
            case SettlementProvider.PayPoint:
                s.CapturedSales = Sum(TillCanonicalField.PayPoint);
                s.CapturedPrizes = 0;
                s.CapturedOwed = s.CapturedSales; // cash collected, owed by DD
                break;
            case SettlementProvider.Payzone:
                s.CapturedSales = Sum(TillCanonicalField.Payzone);
                s.CapturedPrizes = 0;
                s.CapturedOwed = s.CapturedSales;
                break;
            case SettlementProvider.Lottery:
                s.CapturedSales = Sum(TillCanonicalField.LotterySales, TillCanonicalField.ScratchcardSales);
                s.CapturedPrizes = Sum(TillCanonicalField.LotteryPrizes, TillCanonicalField.ScratchcardPrizes);
                s.CapturedCommission = Sum(TillCanonicalField.LotteryCommission);
                s.CapturedOwed = s.CapturedSales - s.CapturedPrizes - s.CapturedCommission;
                break;
            case SettlementProvider.Parcels:
                s.CapturedSales = Sum(TillCanonicalField.Parcels);
                s.CapturedOwed = 0;
                break;
        }
    }

    /// <summary>Variance = settled (DD or statement) − captured owed; banded into a status.</summary>
    private static void Recompute(ProviderSettlement s)
    {
        var settled = s.DdAmount ?? s.StatementAmount;
        if (settled is null)
        {
            s.Variance = 0;
            s.Status = s.Status == SettlementStatus.Settled ? SettlementStatus.Settled : SettlementStatus.Open;
            return;
        }
        s.Variance = settled.Value - s.CapturedOwed;
        if (s.Status != SettlementStatus.Settled)
        {
            s.Status = Math.Abs(s.Variance) <= SettlementTolerance ? SettlementStatus.Matched : SettlementStatus.Discrepancy;
        }
    }

    private async Task<PostOfficeBalance> LoadPoAsync(Guid id, CancellationToken cancellationToken) =>
        await _postOffice.Query().FirstOrDefaultAsync(p => p.Id == id, cancellationToken)
            ?? throw new AppException("post_office_not_found", "Post Office balance not found.", 404);

    private async Task<ProviderSettlement> LoadSettlementAsync(Guid id, CancellationToken cancellationToken) =>
        await _settlements.Query().FirstOrDefaultAsync(s => s.Id == id, cancellationToken)
            ?? throw new AppException("settlement_not_found", "Provider settlement not found.", 404);

    private static TillVarianceStatus PoVarianceStatus(decimal variance)
    {
        var abs = Math.Abs(variance);
        if (abs <= PostOfficeTolerance) return TillVarianceStatus.Ok;
        if (abs <= PostOfficeTolerance * 2) return TillVarianceStatus.Warning;
        return TillVarianceStatus.Alert;
    }

    private static PostOfficeBalanceDto MapPo(PostOfficeBalance p) => new()
    {
        Id = p.Id,
        ShopId = p.ShopId,
        BusinessDate = p.BusinessDate,
        OpeningBalance = p.OpeningBalance,
        CashIn = p.CashIn,
        CashOut = p.CashOut,
        ExpectedBalance = p.ExpectedBalance,
        CountedBalance = p.CountedBalance,
        Variance = p.Variance,
        VarianceStatus = PoVarianceStatus(p.Variance),
        Notes = p.Notes,
        Status = p.Status,
        ConfirmedOn = p.ConfirmedOn,
    };

    private static ProviderSettlementDto MapSettlement(ProviderSettlement s) => new()
    {
        Id = s.Id,
        ShopId = s.ShopId,
        Provider = s.Provider,
        PeriodStart = s.PeriodStart,
        PeriodEnd = s.PeriodEnd,
        CapturedSales = s.CapturedSales,
        CapturedPrizes = s.CapturedPrizes,
        CapturedCommission = s.CapturedCommission,
        CapturedOwed = s.CapturedOwed,
        StatementAmount = s.StatementAmount,
        StatementCommission = s.StatementCommission,
        DdAmount = s.DdAmount,
        DdDate = s.DdDate,
        Variance = s.Variance,
        Status = s.Status,
        Notes = s.Notes,
    };
}
