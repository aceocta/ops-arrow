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
    private readonly IAuditService _auditService;
    private readonly ICurrentUserService _currentUserService;
    private readonly IUnitOfWork _unitOfWork;

    public BusinessDayService(
        IRepository<BusinessDay> businessDayRepository,
        IRepository<Shift> shiftRepository,
        IRepository<ShiftScratchCardSale> salesRepository,
        IRepository<PrizePayout> payoutRepository,
        IRepository<ScratchCardDayCloseSummary> dayCloseSummaryRepository,
        IAuditService auditService,
        ICurrentUserService currentUserService,
        IUnitOfWork unitOfWork)
    {
        _businessDayRepository = businessDayRepository;
        _shiftRepository = shiftRepository;
        _salesRepository = salesRepository;
        _payoutRepository = payoutRepository;
        _dayCloseSummaryRepository = dayCloseSummaryRepository;
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
}
