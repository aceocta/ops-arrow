using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.DTOs.StoreSales;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Entities;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.Services;

public sealed class TillReconciliationService : ITillReconciliationService
{
    // Default cash-variance tolerance (£). Within = OK, up to 2× = Warning, beyond = Alert.
    // TODO Phase 2: make per-shop configurable (absolute or % of cash sales).
    private const decimal VarianceTolerance = 5m;

    private readonly IRepository<TillReconciliation> _reconciliations;
    private readonly IRepository<TillReconciliationLine> _lines;
    private readonly ITillLabelResolver _resolver;
    private readonly ICurrentUserService _currentUser;
    private readonly IUnitOfWork _unitOfWork;

    public TillReconciliationService(
        IRepository<TillReconciliation> reconciliations,
        IRepository<TillReconciliationLine> lines,
        ITillLabelResolver resolver,
        ICurrentUserService currentUser,
        IUnitOfWork unitOfWork)
    {
        _reconciliations = reconciliations;
        _lines = lines;
        _resolver = resolver;
        _currentUser = currentUser;
        _unitOfWork = unitOfWork;
    }

    public async Task<TillReconciliationDto> GetOrCreateAsync(GetOrCreateReconciliationRequest request, CancellationToken cancellationToken = default)
    {
        var existing = await Query()
            .FirstOrDefaultAsync(r =>
                r.ShopId == request.ShopId &&
                r.BusinessDate == request.BusinessDate &&
                r.TillId == request.TillId &&
                r.ReportType == request.ReportType, cancellationToken);

        if (existing is not null)
        {
            return Map(existing);
        }

        var created = new TillReconciliation
        {
            ShopId = request.ShopId,
            TillId = request.TillId,
            ReportType = request.ReportType,
            ShiftId = request.ShiftId,
            BusinessDayId = request.BusinessDayId,
            BusinessDate = request.BusinessDate,
            Status = TillReconciliationStatus.Draft,
            CreatedOn = DateTimeOffset.UtcNow,
            CreatedBy = _currentUser.UserId,
        };
        await _reconciliations.AddAsync(created, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return Map(created);
    }

    public async Task<TillReconciliationDto> GetAsync(Guid id, CancellationToken cancellationToken = default)
        => Map(await LoadAsync(id, cancellationToken));

    public async Task<IReadOnlyCollection<TillReconciliationDto>> ListAsync(Guid shopId, DateOnly from, DateOnly to, CancellationToken cancellationToken = default)
    {
        var rows = await Query()
            .Where(r => r.ShopId == shopId && r.BusinessDate >= from && r.BusinessDate <= to)
            .OrderByDescending(r => r.BusinessDate)
            .ToListAsync(cancellationToken);
        return rows.Select(Map).ToList();
    }

    public async Task<TillReconciliationDto> SaveLineAsync(SaveReconciliationLineRequest request, CancellationToken cancellationToken = default)
    {
        var rec = await LoadAsync(request.ReconciliationId, cancellationToken);

        var line = request.LineId is { } lineId ? rec.Lines.FirstOrDefault(l => l.Id == lineId) : null;
        if (line is null)
        {
            line = new TillReconciliationLine { TillReconciliationId = rec.Id };
            rec.Lines.Add(line);
            await _lines.AddAsync(line, cancellationToken);
        }

        line.CanonicalField = request.CanonicalField;
        line.Section = request.Section;
        line.RawLabel = request.RawLabel;
        line.ExtractedAmount = request.ExtractedAmount;
        line.VerifiedAmount = request.VerifiedAmount;
        line.Quantity = request.Quantity;
        line.CaptureMethod = request.CaptureMethod;
        line.Status = request.Status;
        line.Notes = request.Notes;

        // Teach the resolver this till's wording when the user confirms a mapping from a raw label.
        if (request.LearnMapping && !string.IsNullOrWhiteSpace(request.RawLabel) &&
            request.CanonicalField != TillCanonicalField.Unmapped)
        {
            await _resolver.LearnAsync(
                request.RawLabel!, request.CanonicalField,
                rec.TillId is { } ? TillMappingScope.Till : TillMappingScope.Shop,
                rec.TillId ?? rec.ShopId, request.Section, cancellationToken);
        }

        Recompute(rec);
        _reconciliations.Update(rec);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return Map(rec);
    }

    public async Task<TillReconciliationDto> DeleteLineAsync(Guid lineId, CancellationToken cancellationToken = default)
    {
        var line = await _lines.Query().FirstOrDefaultAsync(l => l.Id == lineId, cancellationToken)
            ?? throw new AppException("line_not_found", "Reconciliation line not found.", 404);
        var rec = await LoadAsync(line.TillReconciliationId, cancellationToken);
        var toRemove = rec.Lines.First(l => l.Id == lineId);
        rec.Lines.Remove(toRemove);
        _lines.Remove(toRemove);
        Recompute(rec);
        _reconciliations.Update(rec);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return Map(rec);
    }

    public async Task<TillReconciliationDto> SetCashCountAsync(SetCashCountRequest request, CancellationToken cancellationToken = default)
    {
        var rec = await LoadAsync(request.ReconciliationId, cancellationToken);
        if (request.OpeningFloat is { } of) rec.OpeningFloat = of;
        rec.CountedCash = request.CountedCash;
        rec.DenominationJson = request.DenominationJson;
        rec.FloatToCarry = request.FloatToCarry;
        rec.CardCounted = request.CardCounted;
        Recompute(rec);
        if (rec.Status == TillReconciliationStatus.Draft) rec.Status = TillReconciliationStatus.NeedsVerification;
        _reconciliations.Update(rec);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return Map(rec);
    }

    public async Task<TillReconciliationDto> SetVarianceReasonAsync(SetVarianceReasonRequest request, CancellationToken cancellationToken = default)
    {
        var rec = await LoadAsync(request.ReconciliationId, cancellationToken);
        rec.VarianceReasonCode = request.ReasonCode;
        rec.VarianceNotes = request.Notes;
        _reconciliations.Update(rec);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return Map(rec);
    }

    public async Task<TillReconciliationDto> SetStatusAsync(Guid id, TillReconciliationStatus status, CancellationToken cancellationToken = default)
    {
        var rec = await LoadAsync(id, cancellationToken);

        // Block approval if a material variance has no reason recorded.
        if (status == TillReconciliationStatus.Approved)
        {
            Recompute(rec);
            if (VarianceStatusOf(rec.CashVariance) != TillVarianceStatus.Ok && string.IsNullOrWhiteSpace(rec.VarianceReasonCode))
            {
                throw new AppException("variance_reason_required", "A variance reason is required before approving.", 400);
            }
            rec.ConfirmedByUserId = _currentUser.UserId;
            rec.ConfirmedOn = DateTimeOffset.UtcNow;
        }

        rec.Status = status;
        _reconciliations.Update(rec);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return Map(rec);
    }

    // --- internals ---

    private IQueryable<TillReconciliation> Query() =>
        _reconciliations.Query().Include(r => r.Lines).Include(r => r.Attachments);

    private async Task<TillReconciliation> LoadAsync(Guid id, CancellationToken cancellationToken) =>
        await Query().FirstOrDefaultAsync(r => r.Id == id, cancellationToken)
            ?? throw new AppException("reconciliation_not_found", "Till reconciliation not found.", 404);

    /// <summary>Core engine: expected drawer cash = float + Σ drawer-affecting lines (in − out).</summary>
    private static void Recompute(TillReconciliation rec)
    {
        decimal drawer = 0;
        foreach (var line in rec.Lines)
        {
            var meta = TillCanonicalCatalogue.Meta(line.CanonicalField);
            if (!meta.AffectsDrawer) continue;
            if (meta.CashDirection == TillCashDirection.In) drawer += line.VerifiedAmount;
            else if (meta.CashDirection == TillCashDirection.Out) drawer -= line.VerifiedAmount;
        }
        rec.ExpectedCash = rec.OpeningFloat + drawer;
        rec.CashVariance = (rec.CountedCash ?? 0) - rec.ExpectedCash;
    }

    private static TillVarianceStatus VarianceStatusOf(decimal variance)
    {
        var abs = Math.Abs(variance);
        if (abs <= VarianceTolerance) return TillVarianceStatus.Ok;
        if (abs <= VarianceTolerance * 2) return TillVarianceStatus.Warning;
        return TillVarianceStatus.Alert;
    }

    private static TillReconciliationDto Map(TillReconciliation r)
    {
        var varianceStatus = VarianceStatusOf(r.CashVariance);
        return new TillReconciliationDto
        {
            Id = r.Id,
            ShopId = r.ShopId,
            TillId = r.TillId,
            ReportType = r.ReportType,
            BusinessDate = r.BusinessDate,
            Status = r.Status,
            OpeningFloat = r.OpeningFloat,
            CountedCash = r.CountedCash,
            FloatToCarry = r.FloatToCarry,
            CardCounted = r.CardCounted,
            ExpectedCash = r.ExpectedCash,
            CashVariance = r.CashVariance,
            VarianceStatus = varianceStatus,
            RequiresReason = varianceStatus != TillVarianceStatus.Ok,
            VarianceReasonCode = r.VarianceReasonCode,
            VarianceNotes = r.VarianceNotes,
            ConfirmedOn = r.ConfirmedOn,
            Lines = r.Lines
                .OrderBy(l => (int)TillCanonicalCatalogue.Meta(l.CanonicalField).Group)
                .Select(MapLine).ToList(),
            Summary = BuildSummary(r),
        };
    }

    private static TillReconciliationLineDto MapLine(TillReconciliationLine l)
    {
        var meta = TillCanonicalCatalogue.Meta(l.CanonicalField);
        return new TillReconciliationLineDto
        {
            Id = l.Id,
            CanonicalField = l.CanonicalField,
            FieldName = meta.DisplayName,
            Group = meta.Group,
            Section = l.Section,
            RawLabel = l.RawLabel,
            ExtractedAmount = l.ExtractedAmount,
            VerifiedAmount = l.VerifiedAmount,
            Quantity = l.Quantity,
            CaptureMethod = l.CaptureMethod,
            Status = l.Status,
            Notes = l.Notes,
        };
    }

    private static TillReconciliationSummaryDto BuildSummary(TillReconciliation r)
    {
        decimal Sum(params TillCanonicalField[] fields) =>
            r.Lines.Where(l => fields.Contains(l.CanonicalField)).Sum(l => l.VerifiedAmount);

        var lotteryNet = Sum(TillCanonicalField.LotterySales, TillCanonicalField.ScratchcardSales)
                         - Sum(TillCanonicalField.LotteryPrizes, TillCanonicalField.ScratchcardPrizes)
                         - Sum(TillCanonicalField.LotteryCommission);

        var owed = new List<ProviderOwedDto>();
        var payPoint = Sum(TillCanonicalField.PayPoint);
        var payzone = Sum(TillCanonicalField.Payzone);
        if (payPoint != 0) owed.Add(new ProviderOwedDto { Provider = "PayPoint", Amount = payPoint });
        if (payzone != 0) owed.Add(new ProviderOwedDto { Provider = "Payzone", Amount = payzone });
        if (lotteryNet != 0) owed.Add(new ProviderOwedDto { Provider = "Lottery (net)", Amount = lotteryNet });

        return new TillReconciliationSummaryDto
        {
            CashTender = Sum(TillCanonicalField.Cash),
            CardTender = Sum(TillCanonicalField.Card, TillCanonicalField.CardDebit, TillCanonicalField.CardCredit, TillCanonicalField.CardContactless),
            CommissionIncome = r.Lines.Where(l => TillCanonicalCatalogue.Meta(l.CanonicalField).IsCommissionIncome).Sum(l => l.VerifiedAmount),
            OwedToProviders = owed,
            NoSaleCount = r.Lines.Where(l => l.CanonicalField == TillCanonicalField.NoSale).Sum(l => l.Quantity ?? 0),
            Voids = Sum(TillCanonicalField.Void),
            Refunds = Sum(TillCanonicalField.Refund),
            UnmappedCount = r.Lines.Count(l => l.CanonicalField == TillCanonicalField.Unmapped),
            UnverifiedCount = r.Lines.Count(l => l.Status != TillLineStatus.Verified),
        };
    }
}
