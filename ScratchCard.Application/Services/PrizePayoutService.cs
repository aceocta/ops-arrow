using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.PrizePayouts;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Entities;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.Services;

public class PrizePayoutService : IPrizePayoutService
{
    private readonly IRepository<PrizePayout> _payoutRepository;
    private readonly IRepository<ScratchCardPack> _packRepository;
    private readonly IRepository<CfgPrizePayoutSettings> _prizePayoutSettingsRepository;
    private readonly IAuditService _auditService;
    private readonly ICurrentUserService _currentUserService;
    private readonly IUnitOfWork _unitOfWork;

    public PrizePayoutService(
        IRepository<PrizePayout> payoutRepository,
        IRepository<ScratchCardPack> packRepository,
        IRepository<CfgPrizePayoutSettings> prizePayoutSettingsRepository,
        IAuditService auditService,
        ICurrentUserService currentUserService,
        IUnitOfWork unitOfWork)
    {
        _payoutRepository = payoutRepository;
        _packRepository = packRepository;
        _prizePayoutSettingsRepository = prizePayoutSettingsRepository;
        _auditService = auditService;
        _currentUserService = currentUserService;
        _unitOfWork = unitOfWork;
    }

    public async Task<PrizePayoutDto> CreateAsync(CreatePrizePayoutRequest request, CancellationToken cancellationToken = default)
    {
        if (request.PackId.HasValue && !string.IsNullOrWhiteSpace(request.TicketNumber))
        {
            var duplicate = await _payoutRepository.Query()
                .AnyAsync(x => x.ShiftId == request.ShiftId && x.PackId == request.PackId && x.TicketNumber == request.TicketNumber, cancellationToken);

            if (duplicate)
            {
                throw new AppException(ErrorCodes.DuplicatePrizePayout, "Duplicate payout for same pack and ticket is not allowed.");
            }

            var pack = await _packRepository.GetByIdAsync(request.PackId.Value, cancellationToken)
                ?? throw new AppException(ErrorCodes.PackNotFound, "Pack not found.", 404);

            if (!int.TryParse(request.TicketNumber, out var ticketNo) ||
                !int.TryParse(pack.StartSerialNumber, out var startNo) ||
                !int.TryParse(pack.EndSerialNumber, out var endNo))
            {
                throw new AppException(ErrorCodes.InvalidSerialRange, "Ticket number or serial range is invalid.");
            }

            var min = Math.Min(startNo, endNo);
            var max = Math.Max(startNo, endNo);
            if (ticketNo < min || ticketNo > max)
            {
                throw new AppException(ErrorCodes.InvalidSerialRange, "Ticket number is outside pack range.");
            }
        }

        var cashierLimit = await ResolveCashierLimitAsync(request.ShopId, cancellationToken);

        var payout = new PrizePayout
        {
            ShopId = request.ShopId,
            BusinessDayId = request.BusinessDayId,
            ShiftId = request.ShiftId,
            PackId = request.PackId,
            TicketNumber = request.TicketNumber,
            PrizeAmount = request.PrizeAmount,
            PaymentMethod = request.PaymentMethod,
            ApprovalStatus = request.PrizeAmount > cashierLimit
                ? PrizePayoutApprovalStatus.Pending
                : PrizePayoutApprovalStatus.Approved,
            PaidByUserId = _currentUserService.UserId ?? Guid.Empty,
            PaidOn = DateTimeOffset.UtcNow,
            Notes = request.Notes
        };

        await _payoutRepository.AddAsync(payout, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(nameof(PrizePayout), payout.Id, "PrizePayoutEntered", payout.ShopId, cancellationToken: cancellationToken);
        return payout.ToDto();
    }

    public async Task<IReadOnlyCollection<PrizePayoutDto>> ListAsync(Guid shiftId, CancellationToken cancellationToken = default)
    {
        var payouts = await _payoutRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShiftId == shiftId)
            .OrderByDescending(x => x.PaidOn)
            .ToListAsync(cancellationToken);

        return payouts.Select(x => x.ToDto()).ToArray();
    }

    public async Task<PrizePayoutDto> ApproveAsync(Guid id, ApprovePrizePayoutRequest request, CancellationToken cancellationToken = default)
    {
        var payout = await _payoutRepository.GetByIdAsync(id, cancellationToken)
            ?? throw new AppException("prize_payout_not_found", "Prize payout not found.", 404);

        payout.ApprovalStatus = PrizePayoutApprovalStatus.Approved;
        payout.ApprovedByUserId = _currentUserService.UserId;
        payout.ApprovedOn = DateTimeOffset.UtcNow;
        payout.Notes = request.Notes ?? payout.Notes;

        _payoutRepository.Update(payout);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(nameof(PrizePayout), payout.Id, "PrizePayoutCorrected", payout.ShopId, cancellationToken: cancellationToken);
        return payout.ToDto();
    }

    private async Task<decimal> ResolveCashierLimitAsync(Guid shopId, CancellationToken cancellationToken)
    {
        var values = await _prizePayoutSettingsRepository.Query()
            .AsNoTracking()
            .Where(x => x.IsActive && (x.ShopId == null || x.ShopId == shopId))
            .OrderByDescending(x => x.ShopId.HasValue)
            .ThenByDescending(x => x.ModifiedOn ?? x.CreatedOn)
            .Select(x => x.CashierPayoutLimit)
            .ToListAsync(cancellationToken);

        foreach (var value in values)
        {
            if (value.HasValue)
            {
                return value.Value;
            }
        }

        return decimal.MaxValue;
    }
}
