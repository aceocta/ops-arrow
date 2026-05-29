using System.Globalization;
using System.Text;
using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.StoreSales;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Entities;
using ScratchCard.Domain.Enums;
using ScratchCard.Shared.Models;

namespace ScratchCard.Application.Services;

public class TillReportService : ITillReportService
{
    private static readonly string[] EditorRoles =
        [RoleNames.CompanyOwner, RoleNames.Manager];

    private readonly IRepository<TillReport> _reportRepository;
    private readonly IRepository<TillCategoryRule> _ruleRepository;
    private readonly IRepository<BusinessDay> _businessDayRepository;
    private readonly IRepository<Shift> _shiftRepository;
    private readonly IRepository<Till> _tillRepository;
    private readonly IRepository<ShopPaymentType> _paymentTypeRepository;
    private readonly ITillReportOcrService _ocrService;
    private readonly ITillRuleEngine _ruleEngine;
    private readonly ITillLineAiClassifier _aiClassifier;
    private readonly IAttachmentStorageService _attachmentStorage;
    private readonly IShopMembershipService _shopMembershipService;
    private readonly ICurrentUserService _currentUserService;
    private readonly IAuditService _auditService;
    private readonly IUnitOfWork _unitOfWork;

    public TillReportService(
        IRepository<TillReport> reportRepository,
        IRepository<TillCategoryRule> ruleRepository,
        IRepository<BusinessDay> businessDayRepository,
        IRepository<Shift> shiftRepository,
        IRepository<Till> tillRepository,
        IRepository<ShopPaymentType> paymentTypeRepository,
        ITillReportOcrService ocrService,
        ITillRuleEngine ruleEngine,
        ITillLineAiClassifier aiClassifier,
        IAttachmentStorageService attachmentStorage,
        IShopMembershipService shopMembershipService,
        ICurrentUserService currentUserService,
        IAuditService auditService,
        IUnitOfWork unitOfWork)
    {
        _reportRepository = reportRepository;
        _ruleRepository = ruleRepository;
        _businessDayRepository = businessDayRepository;
        _shiftRepository = shiftRepository;
        _tillRepository = tillRepository;
        _paymentTypeRepository = paymentTypeRepository;
        _ocrService = ocrService;
        _ruleEngine = ruleEngine;
        _aiClassifier = aiClassifier;
        _attachmentStorage = attachmentStorage;
        _shopMembershipService = shopMembershipService;
        _currentUserService = currentUserService;
        _auditService = auditService;
        _unitOfWork = unitOfWork;
    }

    public async Task<TillReportDto> ProcessAsync(ProcessTillReportRequest request, CancellationToken cancellationToken = default)
    {
        if (request.Files is null || request.Files.Count == 0)
        {
            throw new AppException(ErrorCodes.TillReportImageRequired, "At least one till report photo is required.");
        }

        await _shopMembershipService.EnsureCurrentUserShopRoleAsync(request.ShopId, EditorRoles, cancellationToken);

        var scope = await ResolveScopeAsync(request, cancellationToken);
        var tillId = await ResolveTillIdAsync(request.ShopId, request.TillId, cancellationToken);

        var rules = await _ruleRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == request.ShopId && x.IsActive && !x.IsDeleted)
            .ToListAsync(cancellationToken);

        var report = new TillReport
        {
            ShopId = request.ShopId,
            TillId = tillId,
            ReportType = request.ReportType,
            ShiftId = scope.ShiftId,
            BusinessDayId = scope.BusinessDayId,
            BusinessDate = scope.BusinessDate,
            Status = TillReportStatus.NeedsReview,
            ProcessedOn = DateTimeOffset.UtcNow,
            CreatedOn = DateTimeOffset.UtcNow,
            CreatedBy = _currentUserService.UserId
        };

        // One till report can be assembled from several photos: OCR each, then merge the lines
        // into a single ledger (continuing line numbering across pages).
        var rawText = new StringBuilder();
        var lineNumber = 1;
        var pageNumber = 1;
        // Tender lines (Cash/Card/... whatever the shop has configured) are pulled out of the
        // ledger and summed into the payments table instead of being treated as income/expense
        // descriptions. Detection is driven by the shop's own payment-type list + keywords.
        var paymentTypes = await _paymentTypeRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == request.ShopId && x.IsActive && !x.IsDeleted)
            .ToListAsync(cancellationToken);
        var paymentTotals = new Dictionary<Guid, (string Name, decimal Amount)>();
        foreach (var file in request.Files)
        {
            if (file.Bytes.Length == 0)
            {
                continue;
            }

            var ocr = await _ocrService.ExtractAsync(file.Bytes, file.ContentType, file.FileName, cancellationToken);

            var safeName = SanitizeFileName(file.FileName);
            var relativePath = $"{request.ShopId}/till-reports/{scope.BusinessDate:yyyyMMdd}/{Guid.NewGuid():N}_{safeName}";
            var storedPath = await _attachmentStorage.SaveAsync(file.Bytes, relativePath, cancellationToken);

            report.Attachments.Add(new TillReportAttachment
            {
                PageNumber = pageNumber++,
                StoredPath = storedPath,
                OriginalFileName = string.IsNullOrWhiteSpace(file.FileName) ? "till-report" : file.FileName,
                ContentType = string.IsNullOrWhiteSpace(file.ContentType) ? "image/jpeg" : file.ContentType
            });

            if (!string.IsNullOrWhiteSpace(ocr.RawText))
            {
                if (rawText.Length > 0)
                {
                    rawText.AppendLine();
                }
                rawText.Append(ocr.RawText);
            }

            foreach (var ocrLine in ocr.Lines)
            {
                var matchedType = MatchPaymentType(paymentTypes, ocrLine.Description);
                if (matchedType is not null)
                {
                    var existing = paymentTotals.GetValueOrDefault(matchedType.Id);
                    paymentTotals[matchedType.Id] = (matchedType.Name, existing.Amount + ocrLine.Amount);
                    continue;
                }

                var outcome = _ruleEngine.Classify(rules, ocrLine);
                report.Lines.Add(new TillReportLine
                {
                    LineNumber = lineNumber++,
                    RawDescription = ocrLine.Description,
                    Amount = ocrLine.Amount,
                    TypeCode = ocrLine.TypeCode,
                    Classification = outcome.Classification,
                    Source = outcome.Source,
                    MatchedRuleId = outcome.MatchedRuleId
                });
            }
        }

        foreach (var kvp in paymentTotals)
        {
            report.Payments.Add(new TillReportPayment
            {
                PaymentTypeId = kvp.Key,
                PaymentTypeName = kvp.Value.Name,
                Amount = kvp.Value.Amount,
                Source = TillLineSource.RuleEngine
            });
        }

        if (report.Attachments.Count == 0)
        {
            throw new AppException(ErrorCodes.TillReportImageRequired, "At least one till report photo is required.");
        }

        // For anything the rules engine couldn't place, ask the AI for an income/expense
        // suggestion using the description only (no amounts). The user verifies on review.
        await ApplyAiSuggestionsAsync(report, cancellationToken);

        report.OcrRawText = rawText.ToString();
        RecomputeTotals(report);

        await _reportRepository.AddAsync(report, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(nameof(TillReport), report.Id, "TillReportProcessed", report.ShopId, cancellationToken: cancellationToken);

        return MapDetail(report);
    }

    public async Task<TillReportDto> GetAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var report = await LoadReportAsync(id, asTracking: false, cancellationToken);
        await _shopMembershipService.EnsureCurrentUserShopRoleAsync(report.ShopId, RoleNames.All, cancellationToken);
        return MapDetail(report);
    }

    public async Task<PagedResult<TillReportListItemDto>> ListAsync(Guid shopId, DateOnly? from, DateOnly? to, int page, int pageSize, CancellationToken cancellationToken = default)
    {
        await _shopMembershipService.EnsureCurrentUserShopRoleAsync(shopId, RoleNames.All, cancellationToken);

        var safePage = page < 1 ? 1 : page;
        var safeSize = pageSize is < 1 or > 200 ? 50 : pageSize;

        var query = _reportRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && !x.IsDeleted);

        if (from.HasValue)
        {
            query = query.Where(x => x.BusinessDate >= from.Value);
        }

        if (to.HasValue)
        {
            query = query.Where(x => x.BusinessDate <= to.Value);
        }

        var totalCount = await query.CountAsync(cancellationToken);

        var items = await query
            .OrderByDescending(x => x.BusinessDate)
            .ThenByDescending(x => x.ProcessedOn)
            .Skip((safePage - 1) * safeSize)
            .Take(safeSize)
            .Select(x => new TillReportListItemDto
            {
                Id = x.Id,
                ShopId = x.ShopId,
                TillId = x.TillId,
                TillName = x.Till != null ? x.Till.Name : null,
                ReportType = x.ReportType,
                ShiftId = x.ShiftId,
                BusinessDate = x.BusinessDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                Status = x.Status,
                TotalIncome = x.TotalIncome,
                TotalExpense = x.TotalExpense,
                Net = x.TotalIncome - x.TotalExpense,
                LineCount = x.LineCount,
                UnclassifiedCount = x.Lines.Count(l => l.Classification == TillLineClassification.Unclassified),
                ProcessedOn = x.ProcessedOn
            })
            .ToListAsync(cancellationToken);

        return new PagedResult<TillReportListItemDto> { Items = items, TotalCount = totalCount };
    }

    public async Task<TillReportDto> ReclassifyLineAsync(Guid reportId, Guid lineId, TillLineClassification classification, CancellationToken cancellationToken = default)
    {
        var report = await LoadReportAsync(reportId, asTracking: true, cancellationToken);
        await _shopMembershipService.EnsureCurrentUserShopRoleAsync(report.ShopId, EditorRoles, cancellationToken);

        if (report.Status == TillReportStatus.Confirmed)
        {
            throw new AppException(ErrorCodes.TillReportAlreadyConfirmed, "This till report is already confirmed and can no longer be edited.");
        }

        var line = report.Lines.FirstOrDefault(x => x.Id == lineId)
            ?? throw new AppException(ErrorCodes.TillReportLineNotFound, "Till report line not found.", 404);

        line.Classification = classification;
        line.Source = TillLineSource.Manual;
        line.MatchedRuleId = null;

        // Remember this choice so the same description is auto-classified next time (learning loop),
        // and apply it to any other still-untagged lines with the same description in this report.
        var learnedRule = await UpsertLearnedRuleAsync(report.ShopId, line.RawDescription, classification, cancellationToken);
        if (learnedRule is not null)
        {
            foreach (var sibling in report.Lines)
            {
                if (sibling.Id == line.Id || sibling.Source == TillLineSource.Manual)
                {
                    continue;
                }

                if (string.Equals(sibling.RawDescription.Trim(), line.RawDescription.Trim(), StringComparison.OrdinalIgnoreCase))
                {
                    sibling.Classification = classification;
                    sibling.Source = TillLineSource.RuleEngine;
                    sibling.MatchedRuleId = learnedRule.Id;
                }
            }
        }

        RecomputeTotals(report);
        report.ModifiedOn = DateTimeOffset.UtcNow;
        report.ModifiedBy = _currentUserService.UserId;

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return MapDetail(report);
    }

    /// <summary>
    /// Records (or updates) a per-shop "remembered" rule so a description the user has classified
    /// before is auto-applied to future reports. Stored as an exact (Equals) match.
    /// </summary>
    private async Task<TillCategoryRule?> UpsertLearnedRuleAsync(
        Guid shopId,
        string description,
        TillLineClassification classification,
        CancellationToken cancellationToken)
    {
        if (classification == TillLineClassification.Unclassified)
        {
            return null;
        }

        var pattern = (description ?? string.Empty).Trim();
        if (pattern.Length == 0 || !pattern.Any(char.IsLetter))
        {
            return null;
        }

        if (pattern.Length > 200)
        {
            pattern = pattern[..200];
        }

        var existing = await _ruleRepository.Query()
            .FirstOrDefaultAsync(
                x => x.ShopId == shopId
                    && x.MatchType == TillRuleMatchType.Equals
                    && x.Pattern == pattern
                    && !x.IsDeleted,
                cancellationToken);

        if (existing is not null)
        {
            if (existing.Classification != classification || !existing.IsActive)
            {
                existing.Classification = classification;
                existing.IsActive = true;
                existing.ModifiedOn = DateTimeOffset.UtcNow;
                existing.ModifiedBy = _currentUserService.UserId;
            }

            return existing;
        }

        var rule = new TillCategoryRule
        {
            ShopId = shopId,
            Pattern = pattern,
            MatchType = TillRuleMatchType.Equals,
            Classification = classification,
            // Highest precedence so a remembered exact description wins over broader rules.
            Priority = 0,
            IsActive = true,
            CreatedOn = DateTimeOffset.UtcNow,
            CreatedBy = _currentUserService.UserId
        };

        await _ruleRepository.AddAsync(rule, cancellationToken);
        return rule;
    }

    public async Task<TillReportDto> ConfirmAsync(Guid reportId, CancellationToken cancellationToken = default)
    {
        var report = await LoadReportAsync(reportId, asTracking: true, cancellationToken);
        await _shopMembershipService.EnsureCurrentUserShopRoleAsync(report.ShopId, EditorRoles, cancellationToken);

        if (report.Status == TillReportStatus.Confirmed)
        {
            return MapDetail(report);
        }

        // Confirming the ledger is an explicit "this is correct" — remember each classified
        // description so future reports (and AI-suggested ones) are auto-applied without re-asking.
        var learned = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var line in report.Lines)
        {
            if (line.Classification is TillLineClassification.Income or TillLineClassification.Expense)
            {
                var key = line.RawDescription.Trim();
                if (key.Length > 0 && learned.Add(key))
                {
                    await UpsertLearnedRuleAsync(report.ShopId, line.RawDescription, line.Classification, cancellationToken);
                }
            }
        }

        RecomputeTotals(report);
        report.Status = TillReportStatus.Confirmed;
        report.ConfirmedByUserId = _currentUserService.UserId;
        report.ConfirmedOn = DateTimeOffset.UtcNow;
        report.ModifiedOn = DateTimeOffset.UtcNow;
        report.ModifiedBy = _currentUserService.UserId;

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(nameof(TillReport), report.Id, "TillReportConfirmed", report.ShopId, cancellationToken: cancellationToken);

        return MapDetail(report);
    }

    public async Task<TillReportDto> UpsertPaymentAsync(Guid reportId, Guid paymentTypeId, decimal amount, CancellationToken cancellationToken = default)
    {
        var report = await LoadReportAsync(reportId, asTracking: true, cancellationToken);
        await _shopMembershipService.EnsureCurrentUserShopRoleAsync(report.ShopId, EditorRoles, cancellationToken);

        if (report.Status == TillReportStatus.Confirmed)
        {
            throw new AppException(ErrorCodes.TillReportAlreadyConfirmed, "This till report is already confirmed and can no longer be edited.");
        }

        var paymentType = await _paymentTypeRepository.Query()
            .FirstOrDefaultAsync(x => x.Id == paymentTypeId && x.ShopId == report.ShopId && !x.IsDeleted, cancellationToken)
            ?? throw new AppException(ErrorCodes.PaymentTypeNotFound, "Payment type not found for this shop.", 404);

        var payment = report.Payments.FirstOrDefault(x => x.PaymentTypeId == paymentTypeId);
        if (payment is null)
        {
            payment = new TillReportPayment
            {
                TillReportId = report.Id,
                PaymentTypeId = paymentTypeId,
                PaymentTypeName = paymentType.Name
            };
            report.Payments.Add(payment);
        }
        else
        {
            // Refresh the snapshot name in case the configured payment type was renamed.
            payment.PaymentTypeName = paymentType.Name;
        }

        payment.Amount = amount;
        payment.Source = TillLineSource.Manual;

        report.ModifiedOn = DateTimeOffset.UtcNow;
        report.ModifiedBy = _currentUserService.UserId;

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return MapDetail(report);
    }

    public async Task<TillPaymentSummaryDto> GetPaymentSummaryAsync(Guid shopId, Guid businessDayId, CancellationToken cancellationToken = default)
    {
        await _shopMembershipService.EnsureCurrentUserShopRoleAsync(shopId, RoleNames.All, cancellationToken);

        var reports = await _reportRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && x.BusinessDayId == businessDayId && !x.IsDeleted)
            .Include(x => x.Payments)
            .Include(x => x.Shift)
            .ToListAsync(cancellationToken);

        // Day total prefers day-end reports; if a shop only scans per shift, fall back to those.
        var dayEndReports = reports.Where(x => x.ReportType == TillReportType.DayEnd).ToList();
        var daySource = dayEndReports.Count > 0 ? dayEndReports : reports;

        var dayTotals = SumTenders(daySource);

        var shifts = reports
            .Where(x => x.ReportType == TillReportType.Shift && x.ShiftId.HasValue)
            .GroupBy(x => x.ShiftId!.Value)
            .Select(g => new TillShiftPaymentSummaryDto
            {
                ShiftId = g.Key,
                ShiftName = g.Select(r => r.Shift?.ShiftName).FirstOrDefault(n => !string.IsNullOrWhiteSpace(n)) ?? "Shift",
                Totals = SumTenders(g.ToArray())
            })
            .OrderBy(x => x.ShiftName)
            .ToArray();

        var businessDate = await _businessDayRepository.Query()
            .AsNoTracking()
            .Where(x => x.Id == businessDayId && x.ShopId == shopId)
            .Select(x => (DateOnly?)x.BusinessDate)
            .FirstOrDefaultAsync(cancellationToken);

        return new TillPaymentSummaryDto
        {
            BusinessDayId = businessDayId,
            BusinessDate = businessDate?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) ?? string.Empty,
            DayTotals = dayTotals,
            Shifts = shifts
        };
    }

    public async Task<TillReportScopeSummaryDto> GetDaySummaryAsync(Guid shopId, Guid businessDayId, CancellationToken cancellationToken = default)
    {
        await _shopMembershipService.EnsureCurrentUserShopRoleAsync(shopId, RoleNames.All, cancellationToken);

        var reports = await _reportRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && x.BusinessDayId == businessDayId && !x.IsDeleted)
            .Include(x => x.Payments)
            .ToListAsync(cancellationToken);

        // Prefer day-end reports for the day figure; fall back to shift reports if that's all there is.
        var dayEnd = reports.Where(x => x.ReportType == TillReportType.DayEnd).ToList();
        var source = dayEnd.Count > 0 ? dayEnd : reports;

        return Summarise(source);
    }

    public async Task<TillReportScopeSummaryDto> GetShiftSummaryAsync(Guid shopId, Guid shiftId, CancellationToken cancellationToken = default)
    {
        await _shopMembershipService.EnsureCurrentUserShopRoleAsync(shopId, RoleNames.All, cancellationToken);

        var reports = await _reportRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && x.ShiftId == shiftId && !x.IsDeleted)
            .Include(x => x.Payments)
            .ToListAsync(cancellationToken);

        return Summarise(reports);
    }

    private static TillReportScopeSummaryDto Summarise(IReadOnlyCollection<TillReport> reports)
    {
        var totalSales = reports.Sum(r => r.TotalIncome);
        var payouts = reports.Sum(r => r.TotalExpense);

        return new TillReportScopeSummaryDto
        {
            TotalSales = totalSales,
            Payouts = payouts,
            Net = totalSales - payouts,
            Tenders = SumTenders(reports),
            ReportCount = reports.Count
        };
    }

    private static TillPaymentTypeAmountDto[] SumTenders(IReadOnlyCollection<TillReport> reports)
        => reports
            .SelectMany(r => r.Payments)
            .GroupBy(p => new { p.PaymentTypeId, p.PaymentTypeName })
            .Select(g => new TillPaymentTypeAmountDto
            {
                PaymentTypeId = g.Key.PaymentTypeId,
                Name = g.Key.PaymentTypeName,
                Amount = g.Sum(p => p.Amount)
            })
            .OrderBy(x => x.Name)
            .ToArray();

    public async Task<IReadOnlyCollection<TillCategoryRuleDto>> ListRulesAsync(Guid shopId, CancellationToken cancellationToken = default)
    {
        await _shopMembershipService.EnsureCurrentUserShopRoleAsync(shopId, RoleNames.All, cancellationToken);

        var rules = await _ruleRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && !x.IsDeleted)
            .OrderBy(x => x.Priority)
            .ThenBy(x => x.Pattern)
            .ToListAsync(cancellationToken);

        return rules.Select(MapRule).ToArray();
    }

    public async Task<TillCategoryRuleDto> CreateRuleAsync(CreateTillRuleRequest request, CancellationToken cancellationToken = default)
    {
        await _shopMembershipService.EnsureCurrentUserShopRoleAsync(request.ShopId, EditorRoles, cancellationToken);

        var rule = new TillCategoryRule
        {
            ShopId = request.ShopId,
            Pattern = request.Pattern.Trim(),
            MatchType = request.MatchType,
            Classification = request.Classification,
            Priority = request.Priority,
            IsActive = true,
            CreatedOn = DateTimeOffset.UtcNow,
            CreatedBy = _currentUserService.UserId
        };

        await _ruleRepository.AddAsync(rule, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(nameof(TillCategoryRule), rule.Id, "TillCategoryRuleCreated", rule.ShopId, cancellationToken: cancellationToken);

        return MapRule(rule);
    }

    public async Task DeleteRuleAsync(Guid ruleId, CancellationToken cancellationToken = default)
    {
        var rule = await _ruleRepository.Query()
            .FirstOrDefaultAsync(x => x.Id == ruleId && !x.IsDeleted, cancellationToken)
            ?? throw new AppException(ErrorCodes.TillCategoryRuleNotFound, "Rule not found.", 404);

        await _shopMembershipService.EnsureCurrentUserShopRoleAsync(rule.ShopId, EditorRoles, cancellationToken);

        rule.IsDeleted = true;
        rule.ModifiedOn = DateTimeOffset.UtcNow;
        rule.ModifiedBy = _currentUserService.UserId;

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(nameof(TillCategoryRule), rule.Id, "TillCategoryRuleDeleted", rule.ShopId, cancellationToken: cancellationToken);
    }

    private async Task<TillReport> LoadReportAsync(Guid id, bool asTracking, CancellationToken cancellationToken)
    {
        var query = _reportRepository.Query();
        if (!asTracking)
        {
            query = query.AsNoTracking();
        }

        return await query
            .Include(x => x.Lines)
            .Include(x => x.Attachments)
            .Include(x => x.Payments)
            .Include(x => x.Till)
            .FirstOrDefaultAsync(x => x.Id == id && !x.IsDeleted, cancellationToken)
            ?? throw new AppException(ErrorCodes.TillReportNotFound, "Till report not found.", 404);
    }

    private async Task<Guid?> ResolveTillIdAsync(Guid shopId, Guid? requestedTillId, CancellationToken cancellationToken)
    {
        var shopHasTills = await _tillRepository.Query()
            .AsNoTracking()
            .AnyAsync(x => x.ShopId == shopId && x.IsActive && !x.IsDeleted, cancellationToken);

        if (!shopHasTills)
        {
            // Shop hasn't configured any tills yet — allow capture without one so the user isn't
            // blocked. Once tills exist, picking one is required.
            return null;
        }

        if (!requestedTillId.HasValue || requestedTillId.Value == Guid.Empty)
        {
            throw new AppException(ErrorCodes.TillRequired, "Select which till this report is for.");
        }

        var ownedAndActive = await _tillRepository.Query()
            .AsNoTracking()
            .AnyAsync(
                x => x.Id == requestedTillId.Value && x.ShopId == shopId && x.IsActive && !x.IsDeleted,
                cancellationToken);

        if (!ownedAndActive)
        {
            throw new AppException(ErrorCodes.TillNotFound, "Till not found for this shop.", 404);
        }

        return requestedTillId;
    }

    private async Task<(Guid? BusinessDayId, Guid? ShiftId, DateOnly BusinessDate)> ResolveScopeAsync(
        ProcessTillReportRequest request,
        CancellationToken cancellationToken)
    {
        if (request.ReportType == TillReportType.Shift)
        {
            if (!request.ShiftId.HasValue || request.ShiftId.Value == Guid.Empty)
            {
                throw new AppException("validation_failed", "A shift is required for a shift till report.");
            }

            var shift = await _shiftRepository.Query()
                .AsNoTracking()
                .Where(x => x.Id == request.ShiftId.Value && x.ShopId == request.ShopId)
                .Select(x => new { x.Id, x.BusinessDayId })
                .FirstOrDefaultAsync(cancellationToken)
                ?? throw new AppException("shift_not_found", "Shift not found for this shop.", 404);

            var shiftDate = await _businessDayRepository.Query()
                .AsNoTracking()
                .Where(x => x.Id == shift.BusinessDayId)
                .Select(x => (DateOnly?)x.BusinessDate)
                .FirstOrDefaultAsync(cancellationToken);

            return (shift.BusinessDayId, shift.Id, shiftDate ?? DateOnly.FromDateTime(DateTime.UtcNow));
        }

        if (!request.BusinessDayId.HasValue || request.BusinessDayId.Value == Guid.Empty)
        {
            throw new AppException("validation_failed", "A business day is required for a day-end till report.");
        }

        var businessDate = await _businessDayRepository.Query()
            .AsNoTracking()
            .Where(x => x.Id == request.BusinessDayId.Value && x.ShopId == request.ShopId)
            .Select(x => (DateOnly?)x.BusinessDate)
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new AppException("business_day_not_found", "Business day not found for this shop.", 404);

        return (request.BusinessDayId, null, businessDate);
    }

    private async Task ApplyAiSuggestionsAsync(TillReport report, CancellationToken cancellationToken)
    {
        var unclassified = report.Lines
            .Where(l => l.Classification == TillLineClassification.Unclassified && l.RawDescription.Any(char.IsLetter))
            .ToList();

        if (unclassified.Count == 0)
        {
            return;
        }

        // Index is the id we send to the model — keeps the mapping back to the line trivial and
        // ensures no other line data (e.g. amount) leaves our infrastructure.
        var descriptors = unclassified
            .Select((line, index) => new TillLineDescriptor(index, line.RawDescription))
            .ToList();

        var suggestions = await _aiClassifier.ClassifyAsync(descriptors, cancellationToken);

        for (var i = 0; i < unclassified.Count; i++)
        {
            if (suggestions.TryGetValue(i, out var classification) && classification != TillLineClassification.Unclassified)
            {
                unclassified[i].Classification = classification;
                unclassified[i].Source = TillLineSource.Ai;
            }
        }
    }

    // Matches a description against the shop's configured payment-type keywords. First match wins
    // (ordered by SortOrder then Name). Each payment type carries its own comma-separated keyword
    // list, e.g. "card,visa,mastercard,debit,contactless". Case-insensitive contains.
    private static ShopPaymentType? MatchPaymentType(IReadOnlyCollection<ShopPaymentType> paymentTypes, string? description)
    {
        if (string.IsNullOrWhiteSpace(description) || paymentTypes.Count == 0)
        {
            return null;
        }

        var text = description.ToLowerInvariant();
        // "cashback" / "cash back" is a card-side refund, not a tender — never match it.
        if (text.Contains("cashback") || text.Contains("cash back"))
        {
            return null;
        }

        foreach (var type in paymentTypes.OrderBy(x => x.SortOrder).ThenBy(x => x.Name))
        {
            if (string.IsNullOrWhiteSpace(type.Keywords))
            {
                continue;
            }

            var keywords = type.Keywords
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Select(k => k.ToLowerInvariant())
                .Where(k => k.Length > 0);

            if (keywords.Any(k => text.Contains(k)))
            {
                return type;
            }
        }

        return null;
    }

    private static void RecomputeTotals(TillReport report)
    {
        report.TotalIncome = report.Lines
            .Where(x => x.Classification == TillLineClassification.Income)
            .Sum(x => x.Amount);
        report.TotalExpense = report.Lines
            .Where(x => x.Classification == TillLineClassification.Expense)
            .Sum(x => x.Amount);
        report.LineCount = report.Lines.Count;
    }

    private static TillReportDto MapDetail(TillReport report) => new()
    {
        Id = report.Id,
        ShopId = report.ShopId,
        TillId = report.TillId,
        TillName = report.Till?.Name,
        ReportType = report.ReportType,
        ShiftId = report.ShiftId,
        BusinessDayId = report.BusinessDayId,
        BusinessDate = report.BusinessDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
        Status = report.Status,
        TotalIncome = report.TotalIncome,
        TotalExpense = report.TotalExpense,
        Net = report.TotalIncome - report.TotalExpense,
        LineCount = report.LineCount,
        UnclassifiedCount = report.Lines.Count(x => x.Classification == TillLineClassification.Unclassified),
        AttachmentCount = report.Attachments.Count,
        ProcessedOn = report.ProcessedOn,
        ConfirmedOn = report.ConfirmedOn,
        Lines = report.Lines
            .OrderBy(x => x.LineNumber)
            .Select(MapLine)
            .ToArray(),
        Attachments = report.Attachments
            .OrderBy(x => x.PageNumber)
            .Select(a => new TillReportAttachmentDto
            {
                Id = a.Id,
                PageNumber = a.PageNumber,
                OriginalFileName = a.OriginalFileName,
                ContentType = a.ContentType
            })
            .ToArray(),
        Payments = report.Payments
            .OrderBy(x => x.PaymentTypeName)
            .Select(p => new TillReportPaymentDto
            {
                Id = p.Id,
                PaymentTypeId = p.PaymentTypeId,
                PaymentTypeName = p.PaymentTypeName,
                Amount = p.Amount,
                Source = p.Source
            })
            .ToArray()
    };

    private static TillReportLineDto MapLine(TillReportLine line) => new()
    {
        Id = line.Id,
        LineNumber = line.LineNumber,
        RawDescription = line.RawDescription,
        Amount = line.Amount,
        TypeCode = line.TypeCode,
        Classification = line.Classification,
        Source = line.Source,
        MatchedRuleId = line.MatchedRuleId,
        Notes = line.Notes
    };

    private static TillCategoryRuleDto MapRule(TillCategoryRule rule) => new()
    {
        Id = rule.Id,
        ShopId = rule.ShopId,
        Pattern = rule.Pattern,
        MatchType = rule.MatchType,
        Classification = rule.Classification,
        Priority = rule.Priority,
        IsActive = rule.IsActive
    };

    private static string SanitizeFileName(string fileName)
    {
        if (string.IsNullOrWhiteSpace(fileName))
        {
            return "till-report.jpg";
        }

        var name = System.IO.Path.GetFileName(fileName);
        foreach (var c in System.IO.Path.GetInvalidFileNameChars())
        {
            name = name.Replace(c, '_');
        }

        return name.Length == 0 ? "till-report.jpg" : name;
    }
}
