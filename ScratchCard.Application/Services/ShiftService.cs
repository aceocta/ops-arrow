using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Packs;
using ScratchCard.Application.DTOs.Shifts;
using ScratchCard.Application.DTOs.ShiftSales;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Entities;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.Services;

public class ShiftService : IShiftService
{
    private readonly IRepository<Shift> _shiftRepository;
    private readonly IRepository<BusinessDay> _businessDayRepository;
    private readonly IRepository<ScratchCardPack> _packRepository;
    private readonly IShiftSalesService _shiftSalesService;
    private readonly IAuditService _auditService;
    private readonly ICurrentUserService _currentUserService;
    private readonly IUnitOfWork _unitOfWork;

    public ShiftService(
        IRepository<Shift> shiftRepository,
        IRepository<BusinessDay> businessDayRepository,
        IRepository<ScratchCardPack> packRepository,
        IShiftSalesService shiftSalesService,
        IAuditService auditService,
        ICurrentUserService currentUserService,
        IUnitOfWork unitOfWork)
    {
        _shiftRepository = shiftRepository;
        _businessDayRepository = businessDayRepository;
        _packRepository = packRepository;
        _shiftSalesService = shiftSalesService;
        _auditService = auditService;
        _currentUserService = currentUserService;
        _unitOfWork = unitOfWork;
    }

    public async Task<ShiftDto> OpenAsync(OpenShiftRequest request, CancellationToken cancellationToken = default)
    {
        var businessDay = await _businessDayRepository.GetByIdAsync(request.BusinessDayId, cancellationToken)
            ?? throw new AppException("business_day_not_found", "Business day not found.", 404);

        if (businessDay.Status == BusinessDayStatus.Closed)
        {
            throw new AppException("business_day_closed", "Cannot open shifts for a closed business day.");
        }

        var shift = new Shift
        {
            BusinessDayId = request.BusinessDayId,
            ShopId = request.ShopId,
            ShiftName = request.ShiftName,
            StartTime = DateTimeOffset.UtcNow,
            OpenedByUserId = _currentUserService.UserId ?? Guid.Empty,
            Status = ShiftStatus.Open,
            SyncStatus = SyncStatus.Synced,
            CreatedOn = DateTimeOffset.UtcNow,
            CreatedBy = _currentUserService.UserId
        };

        await _shiftRepository.AddAsync(shift, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(nameof(Shift), shift.Id, "ShiftOpened", shift.ShopId, cancellationToken: cancellationToken);
        return shift.ToDto();
    }

    public async Task<IReadOnlyCollection<ShiftDto>> ListAsync(Guid shopId, Guid? businessDayId = null, CancellationToken cancellationToken = default)
    {
        var query = _shiftRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId);

        if (businessDayId.HasValue)
        {
            query = query.Where(x => x.BusinessDayId == businessDayId.Value);
        }

        var shifts = await query
            .OrderByDescending(x => x.StartTime)
            .ToListAsync(cancellationToken);

        return shifts.Select(x => x.ToDto()).ToArray();
    }

    public async Task<ShiftDto> GetAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var shift = await _shiftRepository.GetByIdAsync(id, cancellationToken)
            ?? throw new AppException("shift_not_found", "Shift not found.", 404);

        return shift.ToDto();
    }

    public Task<ShiftCloseResultDto> CloseAsync(Guid id, FinalizeShiftRequest request, bool isOfflineSync, CancellationToken cancellationToken = default)
    {
        return isOfflineSync
            ? _shiftSalesService.SyncOfflineShiftCloseAsync(new OfflineSyncShiftCloseRequest { ShiftId = id, Payload = request }, cancellationToken)
            : _shiftSalesService.SubmitShiftCloseSalesAsync(id, request, cancellationToken);
    }

    public async Task<ShiftDto> ReopenAsync(Guid id, ReopenShiftRequest request, CancellationToken cancellationToken = default)
    {
        var shift = await _shiftRepository.GetByIdAsync(id, cancellationToken)
            ?? throw new AppException("shift_not_found", "Shift not found.", 404);

        // Reopening older shifts can corrupt pack serial continuity with later shifts.
        var hasLaterShift = await _shiftRepository.Query()
            .AsNoTracking()
            .AnyAsync(
                x => x.ShopId == shift.ShopId &&
                     x.Id != shift.Id &&
                     x.StartTime > shift.StartTime,
                cancellationToken);

        if (hasLaterShift)
        {
            throw new AppException(
                ErrorCodes.ShiftReopenNotLatest,
                "Only the most recent shift can be reopened to avoid serial conflicts with later shifts.",
                409);
        }

        shift.Status = ShiftStatus.Reopened;
        shift.SyncStatus = SyncStatus.Synced;
        shift.EndTime = null;
        shift.ClosedByUserId = null;
        shift.ModifiedOn = DateTimeOffset.UtcNow;
        shift.ModifiedBy = _currentUserService.UserId;

        _shiftRepository.Update(shift);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(nameof(Shift), shift.Id, "ShiftReopened", shift.ShopId, reason: request.Reason, cancellationToken: cancellationToken);
        return shift.ToDto();
    }

    public async Task<IReadOnlyCollection<PackDto>> GetActivePacksForShiftCloseAsync(Guid shiftId, CancellationToken cancellationToken = default)
    {
        var shift = await _shiftRepository.GetByIdAsync(shiftId, cancellationToken)
            ?? throw new AppException("shift_not_found", "Shift not found.", 404);

        var packs = await _packRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shift.ShopId && x.Status == PackStatus.Active && !x.IsDeleted)
            .Include(x => x.Game)
            .ToListAsync(cancellationToken);

        return packs.Select(x => x.ToDto()).ToArray();
    }
}
