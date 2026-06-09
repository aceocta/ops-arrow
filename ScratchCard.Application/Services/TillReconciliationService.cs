using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Models;
using ScratchCard.Application.Common.Services;
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

    // Reconciliation is a shop-floor task (cashiers count/capture); managers also approve.
    private static readonly string[] StaffRoles = [RoleNames.CompanyOwner, RoleNames.Manager, RoleNames.Cashier, RoleNames.SalesAssistant];
    private static readonly string[] ManagementRoles = [RoleNames.CompanyOwner, RoleNames.Manager];

    private readonly IRepository<TillReconciliation> _reconciliations;
    private readonly IRepository<TillReconciliationLine> _lines;
    private readonly IRepository<TillReconciliationAttachment> _attachments;
    private readonly IRepository<User> _users;
    private readonly ITillLabelResolver _resolver;
    private readonly ITillCanonicalAiClassifier _aiClassifier;
    private readonly ITillReportOcrService _ocr;
    private readonly IAttachmentStorageService _storage;
    private readonly IShopMembershipService _shopMembership;
    private readonly IFeatureGateService _featureGate;
    private readonly IRepository<ShopUser> _shopUsers;
    private readonly IRepository<Shop> _shops;
    private readonly INotificationService _notifications;
    private readonly ICurrentUserService _currentUser;
    private readonly IUnitOfWork _unitOfWork;

    public TillReconciliationService(
        IRepository<TillReconciliation> reconciliations,
        IRepository<TillReconciliationLine> lines,
        IRepository<TillReconciliationAttachment> attachments,
        IRepository<User> users,
        ITillLabelResolver resolver,
        ITillCanonicalAiClassifier aiClassifier,
        ITillReportOcrService ocr,
        IAttachmentStorageService storage,
        IShopMembershipService shopMembership,
        IFeatureGateService featureGate,
        IRepository<ShopUser> shopUsers,
        IRepository<Shop> shops,
        INotificationService notifications,
        ICurrentUserService currentUser,
        IUnitOfWork unitOfWork)
    {
        _reconciliations = reconciliations;
        _lines = lines;
        _attachments = attachments;
        _users = users;
        _resolver = resolver;
        _aiClassifier = aiClassifier;
        _ocr = ocr;
        _storage = storage;
        _shopMembership = shopMembership;
        _featureGate = featureGate;
        _shopUsers = shopUsers;
        _shops = shops;
        _notifications = notifications;
        _currentUser = currentUser;
        _unitOfWork = unitOfWork;
    }

    /// <summary>Per-shop authorization: caller must be a member of the shop with an allowed role,
    /// and the shop must have the given Store Sales capability. Stops cross-shop (IDOR) access.</summary>
    private async Task EnsureAccessAsync(Guid shopId, string[] roles, string feature, CancellationToken ct)
    {
        await _shopMembership.EnsureCurrentUserShopRoleAsync(shopId, roles, ct);
        await _featureGate.EnsureFeatureAsync(shopId, feature, ct);
    }

    public async Task<TillReconciliationDto> GetOrCreateAsync(GetOrCreateReconciliationRequest request, CancellationToken cancellationToken = default)
    {
        await EnsureAccessAsync(request.ShopId, StaffRoles, FeatureKeys.StoreSalesBasic, cancellationToken);
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
    {
        var rec = await LoadAsync(id, cancellationToken);
        await EnsureAccessAsync(rec.ShopId, StaffRoles, FeatureKeys.StoreSalesBasic, cancellationToken);
        return Map(rec);
    }

    public async Task<IReadOnlyCollection<TillReconciliationDto>> ListAsync(Guid shopId, DateOnly from, DateOnly to, CancellationToken cancellationToken = default)
    {
        await EnsureAccessAsync(shopId, StaffRoles, FeatureKeys.StoreSalesBasic, cancellationToken);
        var rows = await Query()
            .Where(r => r.ShopId == shopId && r.BusinessDate >= from && r.BusinessDate <= to)
            .OrderByDescending(r => r.BusinessDate)
            .ToListAsync(cancellationToken);
        return rows.Select(Map).ToList();
    }

    public async Task<TillReconciliationDto> SaveLineAsync(SaveReconciliationLineRequest request, CancellationToken cancellationToken = default)
    {
        var rec = await LoadAsync(request.ReconciliationId, cancellationToken);
        await EnsureAccessAsync(rec.ShopId, StaffRoles, FeatureKeys.StoreSalesBasic, cancellationToken);

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
        await EnsureAccessAsync(rec.ShopId, StaffRoles, FeatureKeys.StoreSalesBasic, cancellationToken);
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
        await EnsureAccessAsync(rec.ShopId, StaffRoles, FeatureKeys.StoreSalesBasic, cancellationToken);
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
        await EnsureAccessAsync(rec.ShopId, StaffRoles, FeatureKeys.StoreSalesBasic, cancellationToken);
        rec.VarianceReasonCode = request.ReasonCode;
        rec.VarianceNotes = request.Notes;
        _reconciliations.Update(rec);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return Map(rec);
    }

    public async Task<TillReconciliationDto> SetStatusAsync(Guid id, TillReconciliationStatus status, CancellationToken cancellationToken = default)
    {
        var rec = await LoadAsync(id, cancellationToken);
        // Approval is a management action; capture/reconcile is staff-level.
        await EnsureAccessAsync(rec.ShopId, status == TillReconciliationStatus.Approved ? ManagementRoles : StaffRoles, FeatureKeys.StoreSalesBasic, cancellationToken);

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

        var wasReconciled = rec.Status == TillReconciliationStatus.Reconciled;
        rec.Status = status;
        _reconciliations.Update(rec);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        // Fire a variance alert once, when a shift is first reconciled with a material shortfall.
        if (status == TillReconciliationStatus.Reconciled && !wasReconciled)
        {
            await MaybeSendVarianceAlertAsync(rec, cancellationToken);
        }
        return Map(rec);
    }

    /// <summary>Notify shop managers/owners when a reconciliation lands in the Alert variance band
    /// — gated by the store_sales.alerts feature. Never throws (alerts must not block reconcile).</summary>
    private async Task MaybeSendVarianceAlertAsync(TillReconciliation rec, CancellationToken cancellationToken)
    {
        try
        {
            if (VarianceStatusOf(rec.CashVariance) != TillVarianceStatus.Alert) return;
            if (!await _featureGate.HasFeatureAsync(rec.ShopId, FeatureKeys.StoreSalesAlerts, cancellationToken)) return;

            var shopName = await _shops.Query().Where(s => s.Id == rec.ShopId).Select(s => s.ShopName).FirstOrDefaultAsync(cancellationToken) ?? "your shop";
            var recipients = await _shopUsers.Query().AsNoTracking()
                .Where(x => x.ShopId == rec.ShopId && x.IsActive && !string.IsNullOrWhiteSpace(x.User.Email) &&
                    (x.Role.Name == RoleNames.CompanyOwner || x.Role.Name == RoleNames.Manager))
                .Select(x => x.User.Email!).Distinct().ToListAsync(cancellationToken);

            var v = rec.CashVariance;
            var direction = v < 0 ? "short" : "over";
            var subject = $"Cash variance alert — {shopName} ({rec.BusinessDate:dd MMM})";
            var body = $"A till reconciliation for {shopName} on {rec.BusinessDate:dd MMM yyyy} is {direction} by £{Math.Abs(v):0.00} " +
                       $"(expected £{rec.ExpectedCash:0.00}, counted £{rec.CountedCash ?? 0:0.00}). Please review.";

            foreach (var recipient in recipients)
            {
                try
                {
                    await _notifications.SendAsync(new NotificationMessage
                    {
                        ShopId = rec.ShopId,
                        NotificationType = NotificationType.CashDifferenceAlert,
                        Channel = NotificationChannel.Email,
                        Recipient = recipient,
                        Subject = subject,
                        Body = body,
                        IsPriority = true,
                        RelatedEntityName = nameof(TillReconciliation),
                        RelatedEntityId = rec.Id,
                    }, cancellationToken);
                }
                catch { /* per-recipient failure must not block the rest */ }
            }
        }
        catch { /* alerting is best-effort; never block reconciliation */ }
    }

    public async Task<TillReconciliationDto> IngestPhotoAsync(
        Guid reconciliationId, byte[] content, string contentType, string fileName, string? sourceLabel, CancellationToken cancellationToken = default)
    {
        var rec = await LoadAsync(reconciliationId, cancellationToken);
        await EnsureAccessAsync(rec.ShopId, StaffRoles, FeatureKeys.StoreSalesOcr, cancellationToken);

        // Store the source image, then OCR it.
        var relativePath = $"till-reconciliation/{rec.ShopId:N}/{rec.Id:N}/{Guid.NewGuid():N}_{SanitizeFileName(fileName)}";
        var storedPath = await _storage.SaveAsync(content, relativePath, cancellationToken);
        var ocr = await _ocr.ExtractAsync(content, contentType, fileName, cancellationToken);

        var attachment = new TillReconciliationAttachment
        {
            TillReconciliationId = rec.Id,
            StoragePath = storedPath,
            SourceLabel = sourceLabel,
            OcrRawText = ocr.RawText,
        };
        rec.Attachments.Add(attachment);
        await _attachments.AddAsync(attachment, cancellationToken);

        // 1) Deterministic resolve each OCR'd line → canonical field → draft (Captured) line.
        var created = new List<TillReconciliationLine>();
        foreach (var ocrLine in ocr.Lines)
        {
            if (string.IsNullOrWhiteSpace(ocrLine.Description)) continue;
            var resolution = await _resolver.ResolveAsync(
                ocrLine.Description, rec.ShopId, rec.TillId, section: null, cancellationToken);

            // Skip totals/subtotals so they don't double-count.
            if (resolution.Field == TillCanonicalField.SubtotalIgnore) continue;

            var line = new TillReconciliationLine
            {
                TillReconciliationId = rec.Id,
                CanonicalField = resolution.Field,
                RawLabel = ocrLine.Description.Trim(),
                ExtractedAmount = ocrLine.Amount,
                VerifiedAmount = ocrLine.Amount,
                CaptureMethod = TillCaptureMethod.Photo,
                Status = TillLineStatus.Captured,
                Notes = resolution.Source == TillMappingSource.Fuzzy ? $"fuzzy {resolution.Confidence:P0}" : null,
            };
            created.Add(line);
            rec.Lines.Add(line);
            await _lines.AddAsync(line, cancellationToken);
        }

        // 2) AI fallback (batch) for anything still Unmapped. Graceful: empty map on any AI failure.
        var unmapped = created.Where(l => l.CanonicalField == TillCanonicalField.Unmapped && !string.IsNullOrWhiteSpace(l.RawLabel)).ToList();
        if (unmapped.Count > 0)
        {
            var descriptors = unmapped.Select((l, i) => new TillLineDescriptor(i, l.RawLabel!)).ToList();
            var ai = await _aiClassifier.ClassifyAsync(descriptors, cancellationToken);
            for (var i = 0; i < unmapped.Count; i++)
            {
                if (ai.TryGetValue(i, out var field) && field is not (TillCanonicalField.Unmapped or TillCanonicalField.SubtotalIgnore))
                {
                    unmapped[i].CanonicalField = field;
                    unmapped[i].Notes = unmapped[i].Notes is null ? "ai" : $"{unmapped[i].Notes} · ai";
                }
            }
        }

        if (rec.Status == TillReconciliationStatus.Draft) rec.Status = TillReconciliationStatus.NeedsVerification;
        Recompute(rec);
        _reconciliations.Update(rec);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return Map(rec);
    }

    public async Task<TillRollupDto> GetRollupAsync(Guid shopId, DateOnly businessDate, CancellationToken cancellationToken = default)
    {
        await EnsureAccessAsync(shopId, ManagementRoles, FeatureKeys.StoreSalesMultiTill, cancellationToken);
        var recs = await Query()
            .Where(r => r.ShopId == shopId && r.BusinessDate == businessDate)
            .ToListAsync(cancellationToken);

        var worst = TillVarianceStatus.Ok;
        var rollup = new TillRollupDto
        {
            ShopId = shopId,
            BusinessDate = businessDate,
            TillCount = recs.Count,
            ReconciledCount = recs.Count(r => r.Status is TillReconciliationStatus.Reconciled or TillReconciliationStatus.Approved),
            ApprovedCount = recs.Count(r => r.Status == TillReconciliationStatus.Approved),
        };

        foreach (var r in recs)
        {
            var vs = VarianceStatusOf(r.CashVariance);
            if (vs > worst) worst = vs;
            var summary = BuildSummary(r);
            rollup.TotalExpectedCash += r.ExpectedCash;
            rollup.TotalCountedCash += r.CountedCash ?? 0;
            rollup.TotalCashVariance += r.CashVariance;
            rollup.TotalCommission += summary.CommissionIncome;
            rollup.TotalNoSale += summary.NoSaleCount;
            rollup.TotalVoids += summary.Voids;
            rollup.TotalRefunds += summary.Refunds;
            rollup.Tills.Add(new TillRollupTillDto
            {
                Id = r.Id,
                TillId = r.TillId,
                Status = r.Status,
                ExpectedCash = r.ExpectedCash,
                CountedCash = r.CountedCash,
                CashVariance = r.CashVariance,
                VarianceStatus = vs,
            });
        }

        rollup.WorstVarianceStatus = worst;
        rollup.AllReconciled = recs.Count > 0 && rollup.ReconciledCount == recs.Count;
        return rollup;
    }

    public async Task<TillAnalyticsDto> GetAnalyticsAsync(Guid shopId, DateOnly from, DateOnly to, CancellationToken cancellationToken = default)
    {
        await EnsureAccessAsync(shopId, ManagementRoles, FeatureKeys.StoreSalesDashboard, cancellationToken);
        var recs = await Query()
            .Where(r => r.ShopId == shopId && r.BusinessDate >= from && r.BusinessDate <= to)
            .ToListAsync(cancellationToken);

        var userIds = recs.Where(r => r.CreatedBy.HasValue).Select(r => r.CreatedBy!.Value).Distinct().ToList();
        var users = await _users.Query().AsNoTracking()
            .Where(u => userIds.Contains(u.Id)).ToListAsync(cancellationToken);
        var nameById = users.ToDictionary(
            u => u.Id,
            u => string.IsNullOrWhiteSpace($"{u.FirstName} {u.LastName}".Trim()) ? u.Email : $"{u.FirstName} {u.LastName}".Trim());

        var dto = new TillAnalyticsDto { ShopId = shopId, From = from, To = to };
        foreach (var grp in recs.GroupBy(r => r.CreatedBy))
        {
            var rows = grp.ToList();
            dto.Staff.Add(new TillStaffAnalyticsRow
            {
                UserId = grp.Key,
                Name = grp.Key.HasValue && nameById.TryGetValue(grp.Key.Value, out var n) ? n : "Unknown",
                Count = rows.Count,
                TotalVariance = rows.Sum(r => r.CashVariance),
                ShortCount = rows.Count(r => r.CashVariance < 0),
                AlertCount = rows.Count(r => VarianceStatusOf(r.CashVariance) == TillVarianceStatus.Alert),
                NoSaleCount = rows.Sum(r => r.Lines.Where(l => l.CanonicalField == TillCanonicalField.NoSale).Sum(l => l.Quantity ?? 0)),
            });
        }
        dto.Staff = dto.Staff.OrderByDescending(s => Math.Abs(s.TotalVariance)).ToList();
        return dto;
    }

    private static string SanitizeFileName(string fileName)
    {
        var name = Path.GetFileName(fileName);
        return string.IsNullOrWhiteSpace(name) ? "photo.jpg" : name;
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
