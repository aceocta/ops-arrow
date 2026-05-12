using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.BusinessDays;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Entities;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.Services;

public class BusinessDayService : IBusinessDayService
{
    private readonly IRepository<BusinessDay> _businessDayRepository;
    private readonly IRepository<Shift> _shiftRepository;
    private readonly IRepository<ShiftScratchCardSale> _salesRepository;
    private readonly IRepository<PrizePayout> _payoutRepository;
    private readonly IRepository<ScratchCardDayCloseSummary> _dayCloseSummaryRepository;
    private readonly IShopConfigurationService _shopConfigurationService;
    private readonly IAuditService _auditService;
    private readonly ICurrentUserService _currentUserService;
    private readonly IUnitOfWork _unitOfWork;

    public BusinessDayService(
        IRepository<BusinessDay> businessDayRepository,
        IRepository<Shift> shiftRepository,
        IRepository<ShiftScratchCardSale> salesRepository,
        IRepository<PrizePayout> payoutRepository,
        IRepository<ScratchCardDayCloseSummary> dayCloseSummaryRepository,
        IShopConfigurationService shopConfigurationService,
        IAuditService auditService,
        ICurrentUserService currentUserService,
        IUnitOfWork unitOfWork)
    {
        _businessDayRepository = businessDayRepository;
        _shiftRepository = shiftRepository;
        _salesRepository = salesRepository;
        _payoutRepository = payoutRepository;
        _dayCloseSummaryRepository = dayCloseSummaryRepository;
        _shopConfigurationService = shopConfigurationService;
        _auditService = auditService;
        _currentUserService = currentUserService;
        _unitOfWork = unitOfWork;
    }

    public async Task<BusinessDayDto> OpenAsync(OpenBusinessDayRequest request, CancellationToken cancellationToken = default)
    {
        var existing = await _businessDayRepository.Query()
            .FirstOrDefaultAsync(x => x.ShopId == request.ShopId && x.BusinessDate == request.BusinessDate, cancellationToken);

        if (existing is not null && existing.Status != BusinessDayStatus.Closed)
        {
            throw new AppException("business_day_already_open", "Business day is already open for this date.");
        }

        if (existing is not null && existing.Status == BusinessDayStatus.Closed)
        {
            throw new AppException("business_day_already_closed", "Business day already exists and is closed.");
        }

        var day = new BusinessDay
        {
            ShopId = request.ShopId,
            BusinessDate = request.BusinessDate,
            Status = BusinessDayStatus.Open,
            OpenedByUserId = _currentUserService.UserId ?? Guid.Empty,
            OpenedOn = DateTimeOffset.UtcNow,
            CreatedOn = DateTimeOffset.UtcNow,
            CreatedBy = _currentUserService.UserId
        };

        await _businessDayRepository.AddAsync(day, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        await AutoCreateScheduledShiftsAsync(day, cancellationToken);

        await _auditService.LogAsync(nameof(BusinessDay), day.Id, "BusinessDayOpened", day.ShopId, cancellationToken: cancellationToken);
        return day.ToDto();
    }

    public async Task<IReadOnlyCollection<BusinessDayDto>> ListAsync(Guid shopId, DateOnly? from = null, DateOnly? to = null, CancellationToken cancellationToken = default)
    {
        var query = _businessDayRepository.Query()
            .AsNoTracking()
            .Include(x => x.ScratchCardDayCloseSummary)
            .Where(x => x.ShopId == shopId);

        if (from.HasValue)
        {
            query = query.Where(x => x.BusinessDate >= from.Value);
        }

        if (to.HasValue)
        {
            query = query.Where(x => x.BusinessDate <= to.Value);
        }

        var days = await query
            .OrderByDescending(x => x.BusinessDate)
            .ToListAsync(cancellationToken);

        return days.Select(x => x.ToDto()).ToArray();
    }

    public async Task<BusinessDayDto> GetAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var day = await _businessDayRepository.Query()
            .Include(x => x.ScratchCardDayCloseSummary)
            .FirstOrDefaultAsync(x => x.Id == id, cancellationToken)
            ?? throw new AppException("business_day_not_found", "Business day not found.", 404);

        return day.ToDto();
    }

    public async Task<BusinessDayDto> CloseAsync(Guid id, CloseBusinessDayRequest request, CancellationToken cancellationToken = default)
    {
        var day = await _businessDayRepository.GetByIdAsync(id, cancellationToken)
            ?? throw new AppException("business_day_not_found", "Business day not found.", 404);

        var shifts = await _shiftRepository.Query()
            .Where(x => x.BusinessDayId == id)
            .ToListAsync(cancellationToken);

        if (shifts.Any(x => x.Status == ShiftStatus.Open || x.Status == ShiftStatus.Reopened))
        {
            throw new AppException(ErrorCodes.BusinessDayHasOpenShifts, "Close all shifts before day close.");
        }

        if (shifts.Any(x => x.SyncStatus is SyncStatus.PendingSync or SyncStatus.Syncing or SyncStatus.Conflict or SyncStatus.SyncFailed))
        {
            throw new AppException(ErrorCodes.BusinessDayHasPendingSyncShifts, "Pending sync shifts must be resolved before day close.");
        }

        var shiftIds = shifts.Select(x => x.Id).ToArray();
        var totalSales = await _salesRepository.Query()
            .Where(x => shiftIds.Contains(x.ShiftId))
            .SumAsync(x => x.SalesAmount, cancellationToken);

        var totalPayout = await _payoutRepository.Query()
            .Where(x => x.BusinessDayId == day.Id)
            .SumAsync(x => x.PrizeAmount, cancellationToken);

        day.TotalSalesAmount = totalSales;
        day.TotalPrizePayout = totalPayout;
        day.ExpectedCash = totalSales - totalPayout;
        day.ActualCash = request.ActualCash;
        day.Difference = day.ActualCash - day.ExpectedCash;
        day.Notes = request.Notes;
        day.ClosedByUserId = _currentUserService.UserId;
        day.ClosedOn = DateTimeOffset.UtcNow;
        day.Status = BusinessDayStatus.Closed;
        day.ModifiedOn = DateTimeOffset.UtcNow;
        day.ModifiedBy = _currentUserService.UserId;

        var existingSummary = await _dayCloseSummaryRepository.Query()
            .FirstOrDefaultAsync(x => x.BusinessDayId == day.Id, cancellationToken);

        if (existingSummary is null)
        {
            var createdSummary = new ScratchCardDayCloseSummary
            {
                BusinessDayId = day.Id,
                LottoPayout = request.LottoPayout,
                ScratchCardPayout = request.ScratchCardPayout,
                TillPayout = request.TillPayout,
                CreatedOn = DateTimeOffset.UtcNow,
                CreatedBy = _currentUserService.UserId
            };
            await _dayCloseSummaryRepository.AddAsync(createdSummary, cancellationToken);
            day.ScratchCardDayCloseSummary = createdSummary;
        }
        else
        {
            existingSummary.LottoPayout = request.LottoPayout;
            existingSummary.ScratchCardPayout = request.ScratchCardPayout;
            existingSummary.TillPayout = request.TillPayout;
            existingSummary.ModifiedOn = DateTimeOffset.UtcNow;
            existingSummary.ModifiedBy = _currentUserService.UserId;
            _dayCloseSummaryRepository.Update(existingSummary);
            day.ScratchCardDayCloseSummary = existingSummary;
        }

        _businessDayRepository.Update(day);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(nameof(BusinessDay), day.Id, "DayClosed", day.ShopId, cancellationToken: cancellationToken);
        return day.ToDto();
    }

    public async Task<BusinessDayDto> ReopenAsync(Guid id, ReopenBusinessDayRequest request, CancellationToken cancellationToken = default)
    {
        var day = await _businessDayRepository.GetByIdAsync(id, cancellationToken)
            ?? throw new AppException("business_day_not_found", "Business day not found.", 404);

        day.Status = BusinessDayStatus.Reopened;
        day.ClosedByUserId = null;
        day.ClosedOn = null;
        day.ModifiedOn = DateTimeOffset.UtcNow;
        day.ModifiedBy = _currentUserService.UserId;

        _businessDayRepository.Update(day);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(
            nameof(BusinessDay),
            day.Id,
            "DayReopened",
            day.ShopId,
            reason: request.Reason,
            cancellationToken: cancellationToken);

        return day.ToDto();
    }

    private async Task AutoCreateScheduledShiftsAsync(BusinessDay day, CancellationToken cancellationToken)
    {
        var setup = await _shopConfigurationService.GetShiftSetupAsync(day.ShopId, cancellationToken);
        var activeTemplates = setup.ShiftTemplates
            .Where(x => x.IsActive)
            .ToArray();

        if (activeTemplates.Length == 0)
        {
            return;
        }

        var existingNames = await _shiftRepository.Query()
            .AsNoTracking()
            .Where(x => x.BusinessDayId == day.Id)
            .Select(x => x.ShiftName)
            .ToListAsync(cancellationToken);

        var usedNames = new HashSet<string>(existingNames, StringComparer.OrdinalIgnoreCase);
        var now = DateTimeOffset.UtcNow;
        var newShifts = new List<Shift>(activeTemplates.Length);

        foreach (var template in activeTemplates)
        {
            var shiftName = BuildUniqueShiftName(template.Name, usedNames);
            if (string.IsNullOrWhiteSpace(shiftName))
            {
                continue;
            }

            var scheduledStart = ToUtcDateTime(day.BusinessDate, template.StartTime, setup.TimeZoneId);
            var endDate = template.EndTime <= template.StartTime
                ? day.BusinessDate.AddDays(1)
                : day.BusinessDate;
            var scheduledEnd = ToUtcDateTime(endDate, template.EndTime, setup.TimeZoneId);

            newShifts.Add(new Shift
            {
                BusinessDayId = day.Id,
                ShopId = day.ShopId,
                ShiftName = shiftName,
                StartTime = scheduledStart,
                EndTime = scheduledEnd,
                OpenedByUserId = day.OpenedByUserId,
                Status = ShiftStatus.Scheduled,
                SyncStatus = SyncStatus.Synced,
                Notes = ShiftMetadata.BuildAutoCreatedNote(template.TemplateId, template.StartTime, template.EndTime),
                CreatedOn = now,
                CreatedBy = _currentUserService.UserId
            });
        }

        if (newShifts.Count == 0)
        {
            return;
        }

        await _shiftRepository.AddRangeAsync(newShifts, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        foreach (var shift in newShifts)
        {
            await _auditService.LogAsync(
                nameof(Shift),
                shift.Id,
                "ShiftAutoCreated",
                shift.ShopId,
                reason: shift.ShiftName,
                cancellationToken: cancellationToken);
        }
    }

    private static string BuildUniqueShiftName(string requestedName, ISet<string> usedNames)
    {
        var baseName = string.IsNullOrWhiteSpace(requestedName)
            ? "Shift"
            : requestedName.Trim();

        if (baseName.Length > 100)
        {
            baseName = baseName[..100].TrimEnd();
        }

        if (usedNames.Add(baseName))
        {
            return baseName;
        }

        var sequence = 2;
        while (sequence < 1000)
        {
            var suffix = $" {sequence}";
            var allowedNameLength = Math.Max(1, 100 - suffix.Length);
            var candidate = $"{baseName[..Math.Min(baseName.Length, allowedNameLength)].TrimEnd()}{suffix}";
            if (usedNames.Add(candidate))
            {
                return candidate;
            }

            sequence++;
        }

        return string.Empty;
    }

    private static DateTimeOffset ToUtcDateTime(DateOnly businessDate, TimeSpan timeOfDay, string? timeZoneId)
    {
        var localDateTime = businessDate.ToDateTime(TimeOnly.FromTimeSpan(timeOfDay), DateTimeKind.Unspecified);
        var zone = ResolveTimeZone(timeZoneId);
        if (zone is null)
        {
            return new DateTimeOffset(localDateTime, TimeSpan.Zero);
        }

        var offset = zone.GetUtcOffset(localDateTime);
        var localOffsetTime = new DateTimeOffset(localDateTime, offset);
        return localOffsetTime.ToUniversalTime();
    }

    private static TimeZoneInfo? ResolveTimeZone(string? timeZoneId)
    {
        if (string.IsNullOrWhiteSpace(timeZoneId))
        {
            return null;
        }

        static TimeZoneInfo? TryResolve(string id)
        {
            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById(id);
            }
            catch
            {
                return null;
            }
        }

        var normalized = timeZoneId.Trim();
        var resolved = TryResolve(normalized);
        if (resolved is not null)
        {
            return resolved;
        }

        if (string.Equals(normalized, "Europe/London", StringComparison.OrdinalIgnoreCase))
        {
            return TryResolve("GMT Standard Time");
        }

        if (string.Equals(normalized, "GMT Standard Time", StringComparison.OrdinalIgnoreCase))
        {
            return TryResolve("Europe/London");
        }

        return null;
    }
}
