using System.Globalization;
using System.Net;
using System.Text;
using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Models;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.Services.Reporting;
using ScratchCard.Application.DTOs.BusinessDays;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Entities;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.Services;

public class BusinessDayService : IBusinessDayService
{
    private readonly IRepository<BusinessDay> _businessDayRepository;
    private readonly IRepository<Shift> _shiftRepository;
    private readonly IRepository<RotaShift> _rotaShiftRepository;
    private readonly IRepository<Canister> _canisterRepository;
    private readonly IRepository<ShiftOpeningSerial> _shiftOpeningSerialRepository;
    private readonly IRepository<ShiftScratchCardSale> _salesRepository;
    private readonly IRepository<PrizePayout> _payoutRepository;
    private readonly IRepository<ScratchCardDayCloseSummary> _dayCloseSummaryRepository;
    private readonly IRepository<CanisterDrop> _canisterDropRepository;
    private readonly IRepository<TemperatureMonitoringUnit> _temperatureUnitRepository;
    private readonly IRepository<TemperatureReading> _temperatureReadingRepository;
    private readonly IRepository<ComplianceCheckItem> _complianceCheckItemRepository;
    private readonly IRepository<ComplianceCheckEntry> _complianceCheckEntryRepository;
    private readonly IRepository<UserPushToken> _userPushTokenRepository;
    private readonly IRepository<BusinessDayCloseAttachment> _dayCloseAttachmentRepository;
    private readonly IRepository<CfgDayCloseSettings> _dayCloseSettingsRepository;
    private readonly IRepository<CompanySubscription> _companySubscriptionRepository;
    private readonly IRepository<ShopUser> _shopUserRepository;
    private readonly IRepository<Shop> _shopRepository;
    private readonly IShopConfigurationService _shopConfigurationService;
    private readonly INotificationService _notificationService;
    private readonly IAuditService _auditService;
    private readonly ICurrentUserService _currentUserService;
    private readonly IDayCloseNotificationDispatcher _dayCloseNotificationDispatcher;
    private readonly IDayCloseAttachmentDispatcher _dayCloseAttachmentDispatcher;
    private readonly IAttachmentStorageService _attachmentStorageService;
    private readonly IFeatureGateService _featureGateService;
    private readonly IShopMembershipService _shopMembershipService;
    private readonly IUnitOfWork _unitOfWork;

    public BusinessDayService(
        IRepository<BusinessDay> businessDayRepository,
        IRepository<Shift> shiftRepository,
        IRepository<RotaShift> rotaShiftRepository,
        IRepository<Canister> canisterRepository,
        IRepository<ShiftOpeningSerial> shiftOpeningSerialRepository,
        IRepository<ShiftScratchCardSale> salesRepository,
        IRepository<PrizePayout> payoutRepository,
        IRepository<ScratchCardDayCloseSummary> dayCloseSummaryRepository,
        IRepository<CanisterDrop> canisterDropRepository,
        IRepository<TemperatureMonitoringUnit> temperatureUnitRepository,
        IRepository<TemperatureReading> temperatureReadingRepository,
        IRepository<ComplianceCheckItem> complianceCheckItemRepository,
        IRepository<ComplianceCheckEntry> complianceCheckEntryRepository,
        IRepository<UserPushToken> userPushTokenRepository,
        IRepository<BusinessDayCloseAttachment> dayCloseAttachmentRepository,
        IRepository<CfgDayCloseSettings> dayCloseSettingsRepository,
        IRepository<CompanySubscription> companySubscriptionRepository,
        IRepository<ShopUser> shopUserRepository,
        IRepository<Shop> shopRepository,
        IShopConfigurationService shopConfigurationService,
        INotificationService notificationService,
        IAuditService auditService,
        ICurrentUserService currentUserService,
        IDayCloseNotificationDispatcher dayCloseNotificationDispatcher,
        IDayCloseAttachmentDispatcher dayCloseAttachmentDispatcher,
        IAttachmentStorageService attachmentStorageService,
        IFeatureGateService featureGateService,
        IShopMembershipService shopMembershipService,
        IUnitOfWork unitOfWork)
    {
        _businessDayRepository = businessDayRepository;
        _shiftRepository = shiftRepository;
        _rotaShiftRepository = rotaShiftRepository;
        _canisterRepository = canisterRepository;
        _shiftOpeningSerialRepository = shiftOpeningSerialRepository;
        _salesRepository = salesRepository;
        _payoutRepository = payoutRepository;
        _dayCloseSummaryRepository = dayCloseSummaryRepository;
        _canisterDropRepository = canisterDropRepository;
        _temperatureUnitRepository = temperatureUnitRepository;
        _temperatureReadingRepository = temperatureReadingRepository;
        _complianceCheckItemRepository = complianceCheckItemRepository;
        _complianceCheckEntryRepository = complianceCheckEntryRepository;
        _userPushTokenRepository = userPushTokenRepository;
        _dayCloseAttachmentRepository = dayCloseAttachmentRepository;
        _dayCloseSettingsRepository = dayCloseSettingsRepository;
        _companySubscriptionRepository = companySubscriptionRepository;
        _shopUserRepository = shopUserRepository;
        _shopRepository = shopRepository;
        _shopConfigurationService = shopConfigurationService;
        _notificationService = notificationService;
        _auditService = auditService;
        _currentUserService = currentUserService;
        _dayCloseNotificationDispatcher = dayCloseNotificationDispatcher;
        _dayCloseAttachmentDispatcher = dayCloseAttachmentDispatcher;
        _attachmentStorageService = attachmentStorageService;
        _featureGateService = featureGateService;
        _shopMembershipService = shopMembershipService;
        _unitOfWork = unitOfWork;
    }

    public async Task<BusinessDayDto> OpenAsync(OpenBusinessDayRequest request, CancellationToken cancellationToken = default)
    {
        var effectiveBusinessDate = await ResolveEffectiveBusinessDateAsync(
            request.ShopId,
            request.BusinessDate,
            cancellationToken);
        effectiveBusinessDate = await ResolveNextCreatableBusinessDateAsync(
            request.ShopId,
            effectiveBusinessDate,
            cancellationToken);

        var day = new BusinessDay
        {
            ShopId = request.ShopId,
            BusinessDate = effectiveBusinessDate,
            Status = BusinessDayStatus.Open,
            OpenedByUserId = _currentUserService.UserId ?? Guid.Empty,
            OpenedOn = DateTimeOffset.UtcNow,
            CreatedOn = DateTimeOffset.UtcNow,
            CreatedBy = _currentUserService.UserId
        };

        await _businessDayRepository.AddAsync(day, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        await AutoCreateScheduledShiftsAsync(day, cancellationToken);
        await LinkRotaShiftsToBusinessDayAsync(day, cancellationToken);

        await _auditService.LogAsync(nameof(BusinessDay), day.Id, "BusinessDayOpened", day.ShopId, cancellationToken: cancellationToken);
        var openedDayDto = day.ToDto();
        openedDayDto.MissingOpeningTicketCount = 0;
        openedDayDto.MissingOpeningTicketDetails = [];
        return openedDayDto;
    }

    // Attach any rota shifts rostered for this date (created before the day was opened) to the new
    // business day, so the rota and the trading day are linked. Best-effort; never blocks open.
    private async Task LinkRotaShiftsToBusinessDayAsync(BusinessDay day, CancellationToken cancellationToken)
    {
        try
        {
            var pending = await _rotaShiftRepository.Query()
                .Where(x => x.ShopId == day.ShopId && x.ShiftDate == day.BusinessDate && !x.IsDeleted && x.BusinessDayId == null)
                .ToListAsync(cancellationToken);
            if (pending.Count == 0)
            {
                return;
            }
            foreach (var shift in pending)
            {
                shift.BusinessDayId = day.Id;
                _rotaShiftRepository.Update(shift);
            }
            await _unitOfWork.SaveChangesAsync(cancellationToken);
        }
        catch
        {
            // Linking is non-critical — a failure must not stop the business day from opening.
        }
    }

    private async Task<DateOnly> ResolveNextCreatableBusinessDateAsync(
        Guid shopId,
        DateOnly candidateDate,
        CancellationToken cancellationToken)
    {
        var rows = await _businessDayRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && x.BusinessDate >= candidateDate)
            .Select(x => new { x.BusinessDate, x.Status })
            .OrderBy(x => x.BusinessDate)
            .ToListAsync(cancellationToken);

        var nextDate = candidateDate;
        foreach (var row in rows)
        {
            if (row.BusinessDate < nextDate)
            {
                continue;
            }

            if (row.BusinessDate > nextDate)
            {
                break;
            }

            if (row.Status != BusinessDayStatus.Closed)
            {
                throw new AppException("business_day_already_open", "Business day is already open for this date.");
            }

            nextDate = nextDate.AddDays(1);
        }

        return nextDate;
    }

    public async Task<IReadOnlyCollection<BusinessDayDto>> ListAsync(Guid shopId, DateOnly? from = null, DateOnly? to = null, CancellationToken cancellationToken = default)
    {
        var query = _businessDayRepository.Query()
            .AsNoTracking()
            .AsSplitQuery()
            .Include(x => x.ScratchCardDayCloseSummary)
            .Include(x => x.CloseAttachments)
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
        var missingByDayId = await GetMissingOpeningTicketsByDayIdAsync(days.Select(x => x.Id), cancellationToken);
        var missingDetailsByDayId = await GetMissingOpeningTicketDetailsByDayIdAsync(days.Select(x => x.Id), cancellationToken);
        return days.Select(day =>
        {
            var dto = day.ToDto();
            dto.MissingOpeningTicketCount = missingByDayId.GetValueOrDefault(day.Id);
            dto.MissingOpeningTicketDetails = missingDetailsByDayId.GetValueOrDefault(day.Id, []);
            return dto;
        }).ToArray();
    }

    public async Task<BusinessDayDto> GetAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var day = await _businessDayRepository.Query()
            .AsNoTracking()
            .AsSplitQuery()
            .Include(x => x.ScratchCardDayCloseSummary)
            .Include(x => x.CloseAttachments)
            .FirstOrDefaultAsync(x => x.Id == id, cancellationToken)
            ?? throw new AppException("business_day_not_found", "Business day not found.", 404);
        var missingByDayId = await GetMissingOpeningTicketsByDayIdAsync([day.Id], cancellationToken);
        var missingDetailsByDayId = await GetMissingOpeningTicketDetailsByDayIdAsync([day.Id], cancellationToken);
        var dayDto = day.ToDto();
        dayDto.MissingOpeningTicketCount = missingByDayId.GetValueOrDefault(day.Id);
        dayDto.MissingOpeningTicketDetails = missingDetailsByDayId.GetValueOrDefault(day.Id, []);
        return dayDto;
    }

    public async Task<IReadOnlyCollection<CanisterDto>> ListCanistersAsync(
        Guid businessDayId,
        CancellationToken cancellationToken = default)
    {
        var day = await _businessDayRepository.Query()
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == businessDayId, cancellationToken)
            ?? throw new AppException("business_day_not_found", "Business day not found.", 404);

        await EnsureSafeDropManagementEnabledAsync(day.ShopId, cancellationToken);

        var canisters = await _canisterRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == day.ShopId)
            .OrderByDescending(x => x.IsActive)
            .ThenBy(x => x.CanisterNumber)
            .ThenBy(x => x.CreatedOn)
            .ToListAsync(cancellationToken);

        return canisters.Select(x => x.ToDto()).ToArray();
    }

    public async Task<IReadOnlyCollection<CanisterDropDto>> ListCanisterDropsAsync(
        Guid businessDayId,
        CancellationToken cancellationToken = default)
    {
        var day = await _businessDayRepository.Query()
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == businessDayId, cancellationToken)
            ?? throw new AppException("business_day_not_found", "Business day not found.", 404);

        await EnsureSafeDropManagementEnabledAsync(day.ShopId, cancellationToken);

        var drops = await _canisterDropRepository.Query()
            .AsNoTracking()
            .Where(x => x.BusinessDayId == businessDayId)
            .Include(x => x.Shift)
            .Include(x => x.Canister)
            .OrderByDescending(x => x.DroppedOn)
            .ThenByDescending(x => x.CreatedOn)
            .ToListAsync(cancellationToken);

        return drops.Select(x => x.ToDto()).ToArray();
    }

    public async Task<CanisterDropDto> AddCanisterDropAsync(
        Guid businessDayId,
        CreateCanisterDropRequest request,
        CancellationToken cancellationToken = default)
    {
        var day = await _businessDayRepository.Query()
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == businessDayId, cancellationToken)
            ?? throw new AppException("business_day_not_found", "Business day not found.", 404);

        await EnsureSafeDropManagementEnabledAsync(day.ShopId, cancellationToken);

        var activeShift = await _shiftRepository.Query()
            .Where(
                x => x.BusinessDayId == day.Id &&
                     (x.Status == ShiftStatus.Open || x.Status == ShiftStatus.Reopened))
            .OrderByDescending(x => x.OpenedOn ?? x.CreatedOn)
            .FirstOrDefaultAsync(cancellationToken);

        if (activeShift is null)
        {
            throw new AppException(
                "safe_drop_open_shift_required",
                "An open shift is required before recording a safe drop.",
                400);
        }

        var now = DateTimeOffset.UtcNow;
        var droppedByName = string.IsNullOrWhiteSpace(request.DroppedByName)
            ? _currentUserService.FullName.Trim()
            : request.DroppedByName.Trim();
        if (string.IsNullOrWhiteSpace(droppedByName))
        {
            droppedByName = _currentUserService.Email.Trim();
        }

        var normalizedCanisterNumber = request.CanisterNumber.Trim();
        var canister = await _canisterRepository.Query()
            .FirstOrDefaultAsync(
                x => x.ShopId == day.ShopId && x.CanisterNumber == normalizedCanisterNumber,
                cancellationToken);

        if (canister is null)
        {
            canister = new Canister
            {
                ShopId = day.ShopId,
                CanisterNumber = normalizedCanisterNumber,
                IsActive = true,
                CreatedOn = now,
                CreatedBy = _currentUserService.UserId
            };
            await _canisterRepository.AddAsync(canister, cancellationToken);
        }
        else if (!canister.IsActive)
        {
            canister.IsActive = true;
            canister.ModifiedOn = now;
            canister.ModifiedBy = _currentUserService.UserId;
            _canisterRepository.Update(canister);
        }

        // safe_drop.approval_workflow: Pro plans hold drops in Pending until a manager approves.
        // Below Pro, drops are auto-approved on creation.
        var requiresApproval = await _featureGateService.HasFeatureAsync(
            day.ShopId, FeatureKeys.SafeDropApprovalWorkflow, cancellationToken);

        var entity = new CanisterDrop
        {
            ShopId = day.ShopId,
            BusinessDayId = day.Id,
            ShiftId = activeShift.Id,
            CanisterId = canister.Id,
            Amount = request.Amount,
            DroppedByUserId = _currentUserService.UserId,
            DroppedByName = droppedByName,
            DroppedOn = now,
            ApprovalStatus = requiresApproval ? ApprovalStatus.Pending : ApprovalStatus.Approved,
            ApprovedByUserId = requiresApproval ? null : _currentUserService.UserId,
            ApprovedOn = requiresApproval ? null : now,
            CreatedOn = now,
            CreatedBy = _currentUserService.UserId
        };

        await _canisterDropRepository.AddAsync(entity, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(
            nameof(CanisterDrop),
            entity.Id,
            "CanisterDropAdded",
            day.ShopId,
            reason: $"Canister {canister.CanisterNumber} amount {entity.Amount:0.00} status={entity.ApprovalStatus}",
            cancellationToken: cancellationToken);

        await SendSafeDropOwnerNotificationsAsync(
            day,
            activeShift,
            canister,
            entity,
            cancellationToken);

        await SendCanisterLimitAlertIfBreachedAsync(day.ShopId, canister, cancellationToken);

        entity.Canister = canister;
        entity.Shift = activeShift;
        return entity.ToDto();
    }

    public async Task<CanisterDropDto> ApproveCanisterDropAsync(Guid canisterDropId, string? notes, CancellationToken cancellationToken = default)
    {
        var drop = await _canisterDropRepository.Query()
            .Include(x => x.Canister)
            .Include(x => x.Shift)
            .FirstOrDefaultAsync(x => x.Id == canisterDropId, cancellationToken)
            ?? throw new AppException("canister_drop_not_found", "Canister drop not found.", 404);

        // Per-shop role gate. The controller-level [Authorize] only checks the global role
        // claim; this prevents a Manager at Shop A from approving a drop at Shop B they're
        // only a Cashier at.
        await _shopMembershipService.EnsureCurrentUserShopRoleAsync(
            drop.ShopId,
            new[] { RoleNames.CompanyOwner, RoleNames.Manager },
            cancellationToken);

        await _featureGateService.EnsureFeatureAsync(drop.ShopId, FeatureKeys.SafeDropApprovalWorkflow, cancellationToken);

        if (drop.ApprovalStatus == ApprovalStatus.Approved)
        {
            return drop.ToDto();
        }

        var now = DateTimeOffset.UtcNow;
        drop.ApprovalStatus = ApprovalStatus.Approved;
        drop.ApprovedByUserId = _currentUserService.UserId;
        drop.ApprovedOn = now;
        drop.ApprovalNotes = string.IsNullOrWhiteSpace(notes) ? null : notes.Trim();
        drop.ModifiedOn = now;
        drop.ModifiedBy = _currentUserService.UserId;
        _canisterDropRepository.Update(drop);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(
            nameof(CanisterDrop),
            drop.Id,
            "CanisterDropApproved",
            drop.ShopId,
            reason: notes,
            cancellationToken: cancellationToken);

        return drop.ToDto();
    }

    private async Task SendCanisterLimitAlertIfBreachedAsync(
        Guid shopId,
        Canister canister,
        CancellationToken cancellationToken)
    {
        // Alert dispatch is a Growth+ feature.
        if (!await _featureGateService.HasFeatureAsync(shopId, FeatureKeys.SafeDropCanisterLimitAlerts, cancellationToken))
        {
            return;
        }
        if (!canister.MaxAmount.HasValue || canister.MaxAmount.Value <= 0)
        {
            return;
        }

        // Sum amounts on drops that haven't been reconciled (Pending or Approved, both count as
        // "live" cash in the canister). We treat the canister-level total naively as the running
        // balance; a future enhancement would reset on reconciliation.
        var liveTotal = await _canisterDropRepository.Query()
            .Where(d => d.CanisterId == canister.Id && d.ApprovalStatus != ApprovalStatus.Rejected)
            .SumAsync(d => (decimal?)d.Amount, cancellationToken) ?? 0m;

        if (liveTotal <= canister.MaxAmount.Value) return;

        var recipients = await _shopUserRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && x.IsActive && (x.Role.Name == "CompanyOwner" || x.Role.Name == "Manager"))
            .Include(x => x.Role).Include(x => x.User)
            .Select(x => x.User.Email).Distinct()
            .ToListAsync(cancellationToken);
        if (recipients.Count == 0) return;

        var shopName = await _shopRepository.Query()
            .AsNoTracking().Where(x => x.Id == shopId).Select(x => x.ShopName)
            .FirstOrDefaultAsync(cancellationToken) ?? "Unknown Shop";

        var body = $"Shop: {shopName}\nCanister: {canister.CanisterNumber}\nCurrent total: {liveTotal:0.00}\nConfigured limit: {canister.MaxAmount.Value:0.00}\n\nPlease collect the canister and reset.";

        foreach (var recipient in recipients)
        {
            try
            {
                await _notificationService.SendAsync(new NotificationMessage
                {
                    ShopId = shopId,
                    NotificationType = NotificationType.CanisterLimitExceeded,
                    Channel = NotificationChannel.Email,
                    Recipient = recipient,
                    Subject = $"Safe-drop canister {canister.CanisterNumber} over limit",
                    Body = body,
                    RelatedEntityName = nameof(Canister),
                    RelatedEntityId = canister.Id
                }, cancellationToken);
            }
            catch
            {
                // Alert failures must not block the safe-drop record.
            }
        }
    }

    public async Task<string?> GetCloseAttachmentDataUrlAsync(Guid attachmentId, CancellationToken cancellationToken = default)
    {
        var attachment = await _dayCloseAttachmentRepository.Query()
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == attachmentId, cancellationToken)
            ?? throw new AppException("business_day_attachment_not_found", "Business day attachment not found.", 404);

        return await ReadAttachmentDataUrlAsync(
            _attachmentStorageService,
            attachment.StoredPath,
            attachment.ContentType,
            cancellationToken);
    }

    private async Task SendSafeDropOwnerNotificationsAsync(
        BusinessDay day,
        Shift shift,
        Canister canister,
        CanisterDrop drop,
        CancellationToken cancellationToken)
    {
        var ownerUserIds = await _shopUserRepository.Query()
            .AsNoTracking()
            .Where(
                x =>
                    x.ShopId == day.ShopId &&
                    x.IsActive &&
                    x.Role.Name == RoleNames.CompanyOwner)
            .Select(x => x.UserId)
            .Distinct()
            .ToArrayAsync(cancellationToken);
        if (ownerUserIds.Length == 0)
        {
            return;
        }

        var recipientTokens = await _userPushTokenRepository.Query()
            .AsNoTracking()
            .Where(
                x =>
                    x.ShopId == day.ShopId &&
                    x.IsActive &&
                    (x.Platform.ToLower() == "android" || x.Platform.ToLower() == "fcm") &&
                    ownerUserIds.Contains(x.UserId))
            .Select(x => x.PushToken)
            .Distinct()
            .ToArrayAsync(cancellationToken);
        if (recipientTokens.Length == 0)
        {
            return;
        }

        var shopName = await _shopRepository.Query()
            .AsNoTracking()
            .Where(x => x.Id == day.ShopId)
            .Select(x => x.ShopName)
            .FirstOrDefaultAsync(cancellationToken) ?? "Shop";

        var subject = $"Safe Drop Recorded - {shopName}";
        var amountText = drop.Amount.ToString("0.00", CultureInfo.InvariantCulture);
        var body = $"{drop.DroppedByName} recorded {amountText} in canister {canister.CanisterNumber} for shift {shift.ShiftName}.";

        foreach (var token in recipientTokens)
        {
            try
            {
                await _notificationService.SendAsync(new NotificationMessage
                {
                    ShopId = day.ShopId,
                    NotificationType = NotificationType.SafeDropRecorded,
                    Channel = NotificationChannel.InApp,
                    Recipient = token,
                    Subject = subject,
                    Body = body,
                    RelatedEntityName = nameof(CanisterDrop),
                    RelatedEntityId = drop.Id
                }, cancellationToken);
            }
            catch
            {
                // Notification failures are logged by notification service and must not block safe drop recording.
            }
        }
    }

    public async Task<BusinessDayDto> CloseAsync(Guid id, CloseBusinessDayRequest request, CancellationToken cancellationToken = default)
    {
        var day = await _businessDayRepository.GetByIdAsync(id, cancellationToken)
            ?? throw new AppException("business_day_not_found", "Business day not found.", 404);

        // Per-shop role gate — closes the cross-shop privilege loophole described in
        // ShopMembershipService. Closing the day is an everyday task, so all operational roles
        // (incl. Cashier and SalesAssistant) may do it.
        await _shopMembershipService.EnsureCurrentUserShopRoleAsync(
            day.ShopId,
            new[] { RoleNames.CompanyOwner, RoleNames.Manager, RoleNames.Cashier, RoleNames.SalesAssistant },
            cancellationToken);

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
        day.Difference = request.TillPayout - day.ExpectedCash;
        day.Notes = request.Notes;

        // Attachments are uploaded off the request (enqueued after SaveChanges below) so the close
        // isn't blocked on (potentially slow) blob uploads. Validate the feature gate now so an
        // unentitled attempt is rejected before the close commits; the background worker handles
        // delete-existing + upload-new.
        var attachmentInputs = CloseAttachmentStorage.BuildInputs(
            request.Attachments,
            request.AttachmentFileName,
            request.AttachmentBase64);
        if (attachmentInputs.Count > 0)
        {
            await _featureGateService.EnsureFeatureAsync(day.ShopId, FeatureKeys.ScratchCardAttachments, cancellationToken);
        }

        day.ClosedByUserId = _currentUserService.UserId;
        day.ClosedOn = DateTimeOffset.UtcNow;
        day.Status = BusinessDayStatus.Closed;
        day.ModifiedOn = DateTimeOffset.UtcNow;
        day.ModifiedBy = _currentUserService.UserId;

        var existingSummary = await _dayCloseSummaryRepository.Query()
            .FirstOrDefaultAsync(x => x.BusinessDayId == day.Id, cancellationToken);

        // safe_drop.cash_variance (Pro): include canister-drop variance on the day-close
        // summary. Variance = sum of recorded drops - (TotalSalesAmount - TotalPrizePayout - LottoPayout - ScratchCardPayout - TillPayout).
        // Positive => more cash dropped than expected (over); negative => shortfall.
        decimal? totalDropAmount = null;
        decimal? cashVariance = null;
        if (await _featureGateService.HasFeatureAsync(day.ShopId, FeatureKeys.SafeDropCashVariance, cancellationToken))
        {
            totalDropAmount = await _canisterDropRepository.Query()
                .Where(d => d.BusinessDayId == day.Id && d.ApprovalStatus != ApprovalStatus.Rejected)
                .SumAsync(d => (decimal?)d.Amount, cancellationToken) ?? 0m;

            var expectedDrop = day.TotalSalesAmount
                - day.TotalPrizePayout
                - request.LottoPayout
                - request.ScratchCardPayout
                - request.TillPayout;
            cashVariance = totalDropAmount.Value - expectedDrop;
        }

        if (existingSummary is null)
        {
            var createdSummary = new ScratchCardDayCloseSummary
            {
                BusinessDayId = day.Id,
                LottoPayout = request.LottoPayout,
                ScratchCardPayout = request.ScratchCardPayout,
                TillPayout = request.TillPayout,
                TotalCanisterDropAmount = totalDropAmount,
                CashVariance = cashVariance,
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
            existingSummary.TotalCanisterDropAmount = totalDropAmount;
            existingSummary.CashVariance = cashVariance;
            existingSummary.ModifiedOn = DateTimeOffset.UtcNow;
            existingSummary.ModifiedBy = _currentUserService.UserId;
            _dayCloseSummaryRepository.Update(existingSummary);
            day.ScratchCardDayCloseSummary = existingSummary;
        }

        _businessDayRepository.Update(day);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        // Upload attachments off the request — the close is already persisted; files land moments
        // later. Only enqueue when there are files to upload.
        if (attachmentInputs.Count > 0)
        {
            var attachmentWorkItem = new DayCloseAttachmentWorkItem
            {
                BusinessDayId = day.Id,
                ShopId = day.ShopId,
                BusinessDate = day.BusinessDate,
                CreatedByUserId = _currentUserService.UserId,
                Attachments = request.Attachments?.ToArray() ?? [],
                LegacyAttachmentFileName = request.AttachmentFileName,
                LegacyAttachmentBase64 = request.AttachmentBase64,
            };
            try
            {
                await _dayCloseAttachmentDispatcher.EnqueueAsync(attachmentWorkItem, CancellationToken.None);
            }
            catch
            {
                try
                {
                    // Fallback: process inline so attachments aren't lost if the queue is unavailable.
                    await ProcessDayCloseAttachmentsAsync(attachmentWorkItem, cancellationToken);
                }
                catch
                {
                    // Day close already persisted; never block close on attachment processing.
                }
            }
        }

        await _auditService.LogAsync(nameof(BusinessDay), day.Id, "DayClosed", day.ShopId, cancellationToken: cancellationToken);

        try
        {
            await _dayCloseNotificationDispatcher.EnqueueAsync(
                new DayCloseNotificationWorkItem
                {
                    BusinessDayId = day.Id
                },
                CancellationToken.None);
        }
        catch
        {
            // Notification dispatch queue failures must not block day close.
        }

        var closedDay = await _businessDayRepository.Query()
            .AsNoTracking()
            .AsSplitQuery()
            .Include(x => x.ScratchCardDayCloseSummary)
            .Include(x => x.CloseAttachments)
            .FirstOrDefaultAsync(x => x.Id == day.Id, cancellationToken)
            ?? day;
        var missingByDayId = await GetMissingOpeningTicketsByDayIdAsync([closedDay.Id], cancellationToken);
        var missingDetailsByDayId = await GetMissingOpeningTicketDetailsByDayIdAsync([closedDay.Id], cancellationToken);
        var closedDayDto = closedDay.ToDto();
        closedDayDto.MissingOpeningTicketCount = missingByDayId.GetValueOrDefault(closedDay.Id);
        closedDayDto.MissingOpeningTicketDetails = missingDetailsByDayId.GetValueOrDefault(closedDay.Id, []);
        return closedDayDto;
    }

    public async Task ProcessDayCloseAttachmentsAsync(
        DayCloseAttachmentWorkItem workItem,
        CancellationToken cancellationToken = default)
    {
        // Replace semantics: drop any attachments previously stored against this business day,
        // then upload the new set. Runs in the background so the close call returns immediately.
        var existing = await _dayCloseAttachmentRepository.Query()
            .Where(x => x.BusinessDayId == workItem.BusinessDayId)
            .ToListAsync(cancellationToken);
        foreach (var existingAttachment in existing)
        {
            await _attachmentStorageService.DeleteIfExistsAsync(existingAttachment.StoredPath, cancellationToken);
            _dayCloseAttachmentRepository.Remove(existingAttachment);
        }

        var inputs = CloseAttachmentStorage.BuildInputs(
            workItem.Attachments,
            workItem.LegacyAttachmentFileName,
            workItem.LegacyAttachmentBase64,
            workItem.LegacyAttachmentContentType);

        if (existing.Count == 0 && inputs.Count == 0)
        {
            return; // Nothing to delete or upload.
        }

        if (inputs.Count > 0)
        {
            var savedAttachments = await CloseAttachmentStorage.SaveDayAttachmentsAsync(
                inputs,
                _attachmentStorageService,
                workItem.ShopId,
                workItem.BusinessDate,
                cancellationToken);

            var now = DateTimeOffset.UtcNow;
            var closeAttachments = savedAttachments.Select(saved => new BusinessDayCloseAttachment
            {
                BusinessDayId = workItem.BusinessDayId,
                ShopId = workItem.ShopId,
                OriginalFileName = saved.OriginalFileName,
                StoredFileName = saved.StoredFileName,
                StoredPath = saved.StoredPath,
                ContentType = saved.ContentType,
                FileSizeBytes = saved.FileSizeBytes,
                CreatedOn = now,
                CreatedBy = workItem.CreatedByUserId
            }).ToArray();

            await _dayCloseAttachmentRepository.AddRangeAsync(closeAttachments, cancellationToken);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);
    }

    public async Task SendDayCloseNotificationsAsync(Guid businessDayId, CancellationToken cancellationToken = default)
    {
        var day = await _businessDayRepository.Query()
            .AsNoTracking()
            .Include(x => x.ScratchCardDayCloseSummary)
            .FirstOrDefaultAsync(x => x.Id == businessDayId, cancellationToken);

        if (day is null)
        {
            return;
        }

        var shifts = await _shiftRepository.Query()
            .AsNoTracking()
            .Where(x => x.BusinessDayId == day.Id)
            .ToListAsync(cancellationToken);

        var shiftIds = shifts.Select(x => x.Id).ToArray();
        var daySalesEntries = shiftIds.Length == 0
            ? []
            : await _salesRepository.Query()
                .AsNoTracking()
                .Where(x => shiftIds.Contains(x.ShiftId))
                .Include(x => x.Pack)
                    .ThenInclude(x => x.Game)
                .ToArrayAsync(cancellationToken);

        await SendDayClosePushNotificationsAsync(day, cancellationToken);
        await SendDayCloseSummaryToOwnersAsync(day, shifts, daySalesEntries, cancellationToken);
        // Manual-entry summary report is no longer sent on day close (disabled per product request).
    }

    public async Task<BusinessDayDto> ReopenAsync(Guid id, ReopenBusinessDayRequest request, CancellationToken cancellationToken = default)
    {
        var day = await _businessDayRepository.GetByIdAsync(id, cancellationToken)
            ?? throw new AppException("business_day_not_found", "Business day not found.", 404);

        await _shopMembershipService.EnsureCurrentUserShopRoleAsync(
            day.ShopId,
            new[] { RoleNames.CompanyOwner, RoleNames.Manager },
            cancellationToken);

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
        var missingByDayId = await GetMissingOpeningTicketsByDayIdAsync([day.Id], cancellationToken);
        var missingDetailsByDayId = await GetMissingOpeningTicketDetailsByDayIdAsync([day.Id], cancellationToken);
        var reopenedDto = day.ToDto();
        reopenedDto.MissingOpeningTicketCount = missingByDayId.GetValueOrDefault(day.Id);
        reopenedDto.MissingOpeningTicketDetails = missingDetailsByDayId.GetValueOrDefault(day.Id, []);
        return reopenedDto;
    }

    private async Task AutoCreateScheduledShiftsAsync(BusinessDay day, CancellationToken cancellationToken)
    {
        var setup = await _shopConfigurationService.GetShiftSetupAsync(day.ShopId, cancellationToken);
        var businessDaySetup = await _shopConfigurationService.GetBusinessDaySetupAsync(day.ShopId, cancellationToken);
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

            var (startDate, endDate) = ResolveScheduledShiftDates(
                day.BusinessDate,
                template.StartTime,
                template.EndTime,
                businessDaySetup.BusinessStartTime,
                businessDaySetup.BusinessEndTime);

            var scheduledStart = ToUtcDateTime(startDate, template.StartTime, setup.TimeZoneId);
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

    private static (DateOnly StartDate, DateOnly EndDate) ResolveScheduledShiftDates(
        DateOnly businessDate,
        TimeSpan shiftStartTime,
        TimeSpan shiftEndTime,
        TimeSpan businessStartTime,
        TimeSpan businessEndTime)
    {
        // Overnight business day (for example 22:00 -> 09:59): businessDate is the close date.
        if (businessStartTime > businessEndTime)
        {
            var startDate = shiftStartTime > businessEndTime
                ? businessDate.AddDays(-1)
                : businessDate;

            var endDate = shiftEndTime > businessEndTime
                ? businessDate.AddDays(-1)
                : businessDate;

            if (endDate < startDate || (endDate == startDate && shiftEndTime <= shiftStartTime))
            {
                endDate = endDate.AddDays(1);
            }

            return (startDate, endDate);
        }

        // Same-day business window: keep same date unless template itself crosses midnight.
        var defaultStartDate = businessDate;
        var defaultEndDate = shiftEndTime <= shiftStartTime
            ? businessDate.AddDays(1)
            : businessDate;
        return (defaultStartDate, defaultEndDate);
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

    private async Task<DateOnly> ResolveEffectiveBusinessDateAsync(
        Guid shopId,
        DateOnly requestedBusinessDate,
        CancellationToken cancellationToken)
    {
        var setup = await _shopConfigurationService.GetBusinessDaySetupAsync(shopId, cancellationToken);
        var shopNow = ConvertToShopTime(DateTimeOffset.UtcNow, setup.TimeZoneId);
        var shopToday = DateOnly.FromDateTime(shopNow.DateTime);
        if (requestedBusinessDate != shopToday)
        {
            return requestedBusinessDate;
        }

        return ResolveOperationalBusinessDate(shopToday, shopNow.TimeOfDay, setup.BusinessStartTime, setup.BusinessEndTime);
    }

    private static DateOnly ResolveOperationalBusinessDate(
        DateOnly localDate,
        TimeSpan localTime,
        TimeSpan businessStartTime,
        TimeSpan businessEndTime)
    {
        if (businessStartTime <= businessEndTime)
        {
            return localDate;
        }

        return localTime >= businessStartTime
            ? localDate.AddDays(1)
            : localDate;
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

    private static DateTimeOffset ConvertToShopTime(DateTimeOffset utcNow, string? timeZoneId)
    {
        var zone = ResolveTimeZone(timeZoneId);
        return zone is null ? utcNow : TimeZoneInfo.ConvertTime(utcNow, zone);
    }

    private static async Task<string?> ReadAttachmentDataUrlAsync(
        IAttachmentStorageService attachmentStorageService,
        string? storedPath,
        string? contentType,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(storedPath))
        {
            return null;
        }

        var bytes = await attachmentStorageService.ReadAsync(storedPath, cancellationToken);
        if (bytes is null || bytes.Length == 0)
        {
            return null;
        }

        var mimeType = string.IsNullOrWhiteSpace(contentType)
            ? ResolveAttachmentContentTypeFromExtension(Path.GetExtension(storedPath))
            : contentType.Trim();

        return $"data:{mimeType};base64,{Convert.ToBase64String(bytes)}";
    }

    private static string ResolveAttachmentContentTypeFromExtension(string? extension)
    {
        return extension?.ToLowerInvariant() switch
        {
            ".jpg" or ".jpeg" => "image/jpeg",
            ".png" => "image/png",
            ".webp" => "image/webp",
            ".gif" => "image/gif",
            ".pdf" => "application/pdf",
            ".txt" => "text/plain",
            _ => "application/octet-stream"
        };
    }

    private async Task<Dictionary<Guid, int>> GetMissingOpeningTicketsByDayIdAsync(
        IEnumerable<Guid> businessDayIds,
        CancellationToken cancellationToken)
    {
        var ids = businessDayIds.Distinct().ToArray();
        if (ids.Length == 0)
        {
            return new Dictionary<Guid, int>();
        }

        return await _shiftOpeningSerialRepository.Query()
            .AsNoTracking()
            .Where(x => ids.Contains(x.BusinessDayId))
            .GroupBy(x => x.BusinessDayId)
            .Select(group => new
            {
                BusinessDayId = group.Key,
                MissingTicketCount = group.Sum(x => x.MissingQuantity)
            })
            .ToDictionaryAsync(x => x.BusinessDayId, x => x.MissingTicketCount, cancellationToken);
    }

    private async Task<Dictionary<Guid, IReadOnlyCollection<MissingOpeningTicketDetailDto>>> GetMissingOpeningTicketDetailsByDayIdAsync(
        IEnumerable<Guid> businessDayIds,
        CancellationToken cancellationToken)
    {
        var ids = businessDayIds.Distinct().ToArray();
        if (ids.Length == 0)
        {
            return new Dictionary<Guid, IReadOnlyCollection<MissingOpeningTicketDetailDto>>();
        }

        var rows = await _shiftOpeningSerialRepository.Query()
            .AsNoTracking()
            .Where(x => ids.Contains(x.BusinessDayId) && x.MissingQuantity > 0)
            .OrderBy(x => x.BusinessDayId)
            .ThenBy(x => x.Pack.DisplayNumber)
            .ThenBy(x => x.Pack.Game.GameName)
            .ThenBy(x => x.Pack.PackNumber)
            .Select(x => new
            {
                x.BusinessDayId,
                Detail = new MissingOpeningTicketDetailDto
                {
                    ShiftId = x.ShiftId,
                    ShiftName = x.Shift.ShiftName,
                    PackId = x.PackId,
                    PackNumber = x.Pack.PackNumber,
                    DisplayNumber = x.Pack.DisplayNumber,
                    GameName = x.Pack.Game.GameName,
                    GameCode = x.Pack.Game.GameCode,
                    ExpectedOpeningSerialNumber = x.ExpectedOpeningSerialNumber,
                    ActualOpeningSerialNumber = x.ActualOpeningSerialNumber,
                    MissingQuantity = x.MissingQuantity,
                    OverageQuantity = x.OverageQuantity
                }
            })
            .ToListAsync(cancellationToken);

        return rows
            .GroupBy(x => x.BusinessDayId)
            .ToDictionary(
                group => group.Key,
                group => (IReadOnlyCollection<MissingOpeningTicketDetailDto>)group.Select(x => x.Detail).ToArray());
    }

    private async Task<bool> IsSafeDropManagementEnabledForReportAsync(Guid shopId, CancellationToken cancellationToken)
    {
        var companyId = await _shopRepository.Query()
            .AsNoTracking()
            .Where(x => x.Id == shopId && !x.IsDeleted && x.CompanyId.HasValue)
            .Select(x => x.CompanyId!.Value)
            .FirstOrDefaultAsync(cancellationToken);
        if (companyId == Guid.Empty)
        {
            return false;
        }

        var companySubscription = await _companySubscriptionRepository.Query()
            .AsNoTracking()
            .Include(x => x.SubscriptionPlan)
                .ThenInclude(p => p!.PlanFeatures)
                    .ThenInclude(pf => pf.Feature)
            .FirstOrDefaultAsync(x => x.CompanyId == companyId, cancellationToken);
        if (companySubscription?.SubscriptionPlan is null)
        {
            return false;
        }

        var includedFeatures = ServiceMappingExtensions.ExtractEnabledFeatureKeys(companySubscription.SubscriptionPlan.PlanFeatures);
        var hasSubscriptionFeature = includedFeatures.Any(
            x => string.Equals(x, FeatureKeys.SafeDropManagement, StringComparison.OrdinalIgnoreCase));
        if (!hasSubscriptionFeature)
        {
            return false;
        }

        var settingsRows = await _dayCloseSettingsRepository.Query()
            .AsNoTracking()
            .Where(x => x.IsActive && (x.ShopId == null || x.ShopId == shopId))
            .OrderByDescending(x => x.ShopId == shopId)
            .ThenByDescending(x => x.ModifiedOn ?? x.CreatedOn)
            .ToListAsync(cancellationToken);

        var shopValue = settingsRows
            .Where(x => x.ShopId == shopId)
            .Select(x => x.EnableSafeDropManagement)
            .FirstOrDefault();
        var globalValue = settingsRows
            .Where(x => x.ShopId == null)
            .Select(x => x.EnableSafeDropManagement)
            .FirstOrDefault();

        return shopValue ?? globalValue ?? false;
    }

    private async Task EnsureSafeDropManagementEnabledAsync(Guid shopId, CancellationToken cancellationToken)
    {
        var companyId = await _shopRepository.Query()
            .AsNoTracking()
            .Where(x => x.Id == shopId && !x.IsDeleted && x.CompanyId.HasValue)
            .Select(x => x.CompanyId!.Value)
            .FirstOrDefaultAsync(cancellationToken);

        if (companyId == Guid.Empty)
        {
            throw new AppException("shop_not_found", "Shop not found.", 404);
        }

        var companySubscription = await _companySubscriptionRepository.Query()
            .AsNoTracking()
            .Include(x => x.SubscriptionPlan)
                .ThenInclude(p => p!.PlanFeatures)
                    .ThenInclude(pf => pf.Feature)
            .FirstOrDefaultAsync(x => x.CompanyId == companyId, cancellationToken);

        if (companySubscription?.SubscriptionPlan is null)
        {
            throw new AppException(
                "safe_drop_feature_not_in_subscription",
                "Safe drop management is not available for your subscription package.",
                403);
        }

        var includedFeatures = ServiceMappingExtensions.ExtractEnabledFeatureKeys(companySubscription.SubscriptionPlan.PlanFeatures);
        var hasSubscriptionFeature = includedFeatures.Any(
            x => string.Equals(x, FeatureKeys.SafeDropManagement, StringComparison.OrdinalIgnoreCase));

        if (!hasSubscriptionFeature)
        {
            throw new AppException(
                "safe_drop_feature_not_in_subscription",
                "Safe drop management is not available for your subscription package.",
                403);
        }

        var settingsRows = await _dayCloseSettingsRepository.Query()
            .AsNoTracking()
            .Where(x => x.IsActive && (x.ShopId == null || x.ShopId == shopId))
            .OrderByDescending(x => x.ShopId == shopId)
            .ThenByDescending(x => x.ModifiedOn ?? x.CreatedOn)
            .ToListAsync(cancellationToken);

        var shopValue = settingsRows
            .Where(x => x.ShopId == shopId)
            .Select(x => x.EnableSafeDropManagement)
            .FirstOrDefault();
        var globalValue = settingsRows
            .Where(x => x.ShopId == null)
            .Select(x => x.EnableSafeDropManagement)
            .FirstOrDefault();
        var isEnabled = shopValue ?? globalValue ?? false;

        if (!isEnabled)
        {
            throw new AppException(
                "safe_drop_feature_disabled",
                "Safe drop management is disabled for this shop.",
                403);
        }
    }

    private async Task SendDayCloseSummaryToOwnersAsync(
        BusinessDay day,
        IReadOnlyCollection<Shift> shifts,
        IReadOnlyCollection<ShiftScratchCardSale> entries,
        CancellationToken cancellationToken)
    {
        var recipients = await ResolveSummaryRecipientsAsync(day.ShopId, cancellationToken);

        if (recipients.Count == 0)
        {
            return;
        }

        var shopName = await _shopRepository.Query()
            .AsNoTracking()
            .Where(x => x.Id == day.ShopId)
            .Select(x => x.ShopName)
            .FirstOrDefaultAsync(cancellationToken) ?? "Unknown Shop";

        var missingOpeningTicketCount = await _shiftOpeningSerialRepository.Query()
            .AsNoTracking()
            .Where(x => x.BusinessDayId == day.Id)
            .SumAsync(x => (int?)x.MissingQuantity, cancellationToken) ?? 0;

        // Section-by-feature gating: only include a section in the day-end report if the shop's
        // plan has the corresponding module enabled. Each feature key check returns false when
        // the plan doesn't include it OR the shop owner has toggled the module off in settings.
        var scratchCardEnabled = await _featureGateService.HasFeatureAsync(day.ShopId, FeatureKeys.ScratchCardManagement, cancellationToken);
        var temperatureEnabled = await _featureGateService.HasFeatureAsync(day.ShopId, FeatureKeys.TemperatureLog, cancellationToken);
        var complianceEnabled = await _featureGateService.HasFeatureAsync(day.ShopId, FeatureKeys.ComplianceChecklist, cancellationToken);
        var safeDropManagementEnabled = await IsSafeDropManagementEnabledForReportAsync(day.ShopId, cancellationToken);

        var safeDropRows = safeDropManagementEnabled
            ? await _canisterDropRepository.Query()
                .AsNoTracking()
                .Where(x => x.BusinessDayId == day.Id)
                .OrderByDescending(x => x.DroppedOn)
                .ThenByDescending(x => x.CreatedOn)
                .Select(x => new SafeDropSummaryRow(
                    x.Canister.CanisterNumber,
                    x.Amount,
                    x.DroppedByName,
                    x.Shift.ShiftName,
                    x.DroppedOn))
                .ToArrayAsync(cancellationToken)
            : [];

        var temperatureRows = temperatureEnabled
            ? await LoadTemperatureSummaryForReportAsync(day.ShopId, day.BusinessDate, cancellationToken)
            : [];
        var complianceSummary = complianceEnabled
            ? await LoadComplianceDailySummaryForReportAsync(day.ShopId, day.BusinessDate, cancellationToken)
            : new ComplianceDailySummary(0, 0, 0, 0);
        var scratchCardEntries = scratchCardEnabled ? entries : Array.Empty<ShiftScratchCardSale>();
        var missingOpeningTicketsForReport = scratchCardEnabled ? missingOpeningTicketCount : 0;

        var subject = $"Day Close Summary - {shopName} - {day.BusinessDate:yyyy-MM-dd}";
        var body = BuildDayCloseSummaryBodyHtml(
            shopName,
            day,
            shifts,
            scratchCardEntries,
            missingOpeningTicketsForReport,
            safeDropRows,
            safeDropManagementEnabled,
            temperatureRows,
            complianceSummary,
            scratchCardEnabled);

        // One PDF per enabled report section, attached separately. The HTML body still carries
        // every enabled section inline.
        var attachments = BuildDayCloseAttachments(
            shopName,
            day,
            scratchCardEntries,
            safeDropRows,
            safeDropManagementEnabled,
            temperatureRows,
            complianceSummary,
            scratchCardEnabled);

        foreach (var recipient in recipients)
        {
            try
            {
                await _notificationService.SendAsync(new NotificationMessage
                {
                    ShopId = day.ShopId,
                    NotificationType = NotificationType.DayCloseSummary,
                    Channel = NotificationChannel.Email,
                    Recipient = recipient,
                    Subject = subject,
                    Body = body,
                    IsBodyHtml = true,
                    Attachments = attachments,
                    RelatedEntityName = nameof(BusinessDay),
                    RelatedEntityId = day.Id
                }, cancellationToken);
            }
            catch
            {
                // Notification failures are logged by notification service and must not block day close.
            }
        }

        // WhatsApp companion: short plaintext day summary fanned out to every active CompanyOwner
        // AND Manager phone on the shop (gated on notifications.whatsapp). Email always carries
        // the full HTML + PDF; WhatsApp is the at-a-glance "day's closed" heads-up.
        var whatsAppRecipients = await ResolveDayCloseWhatsAppRecipientsAsync(day.ShopId, cancellationToken);
        if (whatsAppRecipients.Count > 0)
        {
            var whatsAppBody = BuildDayCloseSummaryWhatsAppBody(
                shopName,
                day,
                shifts,
                entries,
                missingOpeningTicketCount,
                safeDropRows,
                safeDropManagementEnabled,
                temperatureRows);

            foreach (var recipientPhone in whatsAppRecipients)
            {
                try
                {
                    await _notificationService.SendAsync(new NotificationMessage
                    {
                        ShopId = day.ShopId,
                        NotificationType = NotificationType.DayCloseSummary,
                        Channel = NotificationChannel.WhatsApp,
                        Recipient = recipientPhone,
                        Subject = subject,
                        Body = whatsAppBody,
                        IsBodyHtml = false,
                        RelatedEntityName = nameof(BusinessDay),
                        RelatedEntityId = day.Id
                    }, cancellationToken);
                }
                catch
                {
                    // Per-recipient failure must not block the rest or day close itself.
                }
            }
        }
    }

    /// <summary>
    /// Day-end recipients = every active CompanyOwner OR Manager on the shop with a saved
    /// phone number. Owners get the day summary; shift-close goes to managers only.
    /// </summary>
    private async Task<IReadOnlyList<string>> ResolveDayCloseWhatsAppRecipientsAsync(Guid shopId, CancellationToken cancellationToken)
    {
        return await _shopUserRepository.Query()
            .AsNoTracking()
            .Where(x =>
                x.ShopId == shopId &&
                x.IsActive &&
                (x.Role.Name == RoleNames.CompanyOwner || x.Role.Name == RoleNames.Manager) &&
                !string.IsNullOrWhiteSpace(x.User.PhoneNumber))
            .Select(x => x.User.PhoneNumber!)
            .Distinct()
            .ToListAsync(cancellationToken);
    }

    /// <summary>
    /// Compact plaintext day-end summary suitable for WhatsApp (stays well under the 1024-char
    /// template parameter limit). Headline numbers only; full breakdown stays in email.
    /// </summary>
    private static string BuildDayCloseSummaryWhatsAppBody(
        string shopName,
        BusinessDay day,
        IReadOnlyCollection<Shift> shifts,
        IReadOnlyCollection<ShiftScratchCardSale> entries,
        int missingOpeningTicketCount,
        IReadOnlyCollection<SafeDropSummaryRow> safeDropRows,
        bool safeDropManagementEnabled,
        IReadOnlyCollection<TemperatureSummaryRow> temperatureRows)
    {
        var totalSales = entries.Sum(e => e.SalesAmount);
        var totalTickets = entries.Sum(e => e.SoldQuantity);

        var lines = new List<string>
        {
            $"{shopName} - Day Close",
            $"{day.BusinessDate:yyyy-MM-dd}",
            string.Empty,
            $"Shifts: {shifts.Count}",
            $"Scratch sales: £{totalSales:N2}",
            $"Tickets sold: {totalTickets}",
        };

        if (missingOpeningTicketCount > 0)
        {
            lines.Add($"Missing opening tickets: {missingOpeningTicketCount}");
        }

        if (safeDropManagementEnabled)
        {
            var safeDropTotal = safeDropRows.Sum(r => r.Amount);
            lines.Add($"Safe drops: £{safeDropTotal:N2} ({safeDropRows.Count})");
        }

        if (temperatureRows.Count > 0)
        {
            var outOfRange = temperatureRows.Count(r => r.IsOutOfRange == true);
            lines.Add(outOfRange == 0
                ? $"Temperature: all {temperatureRows.Count} unit(s) in range"
                : $"Temperature: {outOfRange} of {temperatureRows.Count} unit(s) out of range");
        }

        if (!string.IsNullOrWhiteSpace(day.Notes))
        {
            lines.Add(string.Empty);
            lines.Add($"Note: {day.Notes.Trim()}");
        }

        lines.Add(string.Empty);
        lines.Add("Full report sent to your email.");

        return string.Join('\n', lines);
    }

    private async Task SendDayClosePushNotificationsAsync(
        BusinessDay day,
        CancellationToken cancellationToken)
    {
        var recipientUserIds = await _shopUserRepository.Query()
            .AsNoTracking()
            .Where(
                x =>
                    x.ShopId == day.ShopId &&
                    x.IsActive &&
                    (x.Role.Name == RoleNames.CompanyOwner || x.Role.Name == RoleNames.Manager))
            .Select(x => x.UserId)
            .Distinct()
            .ToArrayAsync(cancellationToken);
        if (recipientUserIds.Length == 0)
        {
            return;
        }

        var recipientTokens = await _userPushTokenRepository.Query()
            .AsNoTracking()
            .Where(
                x =>
                    x.ShopId == day.ShopId &&
                    x.IsActive &&
                    recipientUserIds.Contains(x.UserId) &&
                    (x.Platform.ToLower() == "fcm" || x.Platform.ToLower() == "android" || x.Platform.ToLower() == "ios"))
            .Select(x => x.PushToken)
            .Distinct()
            .ToArrayAsync(cancellationToken);
        if (recipientTokens.Length == 0)
        {
            return;
        }

        var shopName = await _shopRepository.Query()
            .AsNoTracking()
            .Where(x => x.Id == day.ShopId)
            .Select(x => x.ShopName)
            .FirstOrDefaultAsync(cancellationToken) ?? "Shop";

        var subject = $"Day Closed - {shopName}";
        var body = $"Business day {day.BusinessDate:yyyy-MM-dd} is closed. Expected cash: {day.ExpectedCash:0.00}, till: {day.ScratchCardDayCloseSummary?.TillPayout ?? 0m:0.00}.";

        foreach (var token in recipientTokens)
        {
            try
            {
                await _notificationService.SendAsync(new NotificationMessage
                {
                    ShopId = day.ShopId,
                    NotificationType = NotificationType.DayCloseSummary,
                    Channel = NotificationChannel.InApp,
                    Recipient = token,
                    Subject = subject,
                    Body = body,
                    RelatedEntityName = nameof(BusinessDay),
                    RelatedEntityId = day.Id
                }, cancellationToken);
            }
            catch
            {
                // Notification failures are logged by notification service and must not block day close.
            }
        }
    }

    private async Task SendManualEntrySummaryByShiftOnDayCloseAsync(
        BusinessDay day,
        IReadOnlyCollection<Shift> shifts,
        IReadOnlyCollection<ShiftScratchCardSale> entries,
        CancellationToken cancellationToken)
    {
        var manualEntries = entries
            .Where(x => x.IsManualEntry && !x.NotificationSent)
            .ToArray();
        if (manualEntries.Length == 0)
        {
            return;
        }

        var recipients = await ResolveSummaryRecipientsAsync(day.ShopId, cancellationToken);
        if (recipients.Count == 0)
        {
            return;
        }

        var shopName = await _shopRepository.Query()
            .AsNoTracking()
            .Where(x => x.Id == day.ShopId)
            .Select(x => x.ShopName)
            .FirstOrDefaultAsync(cancellationToken) ?? "Unknown Shop";

        var subject = $"Manual Entry Summary by Shift - {shopName} - {day.BusinessDate:yyyy-MM-dd}";
        var body = BuildDayCloseManualEntryByShiftBody(shopName, day, shifts, manualEntries);

        var anySent = false;
        foreach (var recipient in recipients)
        {
            try
            {
                await _notificationService.SendAsync(new NotificationMessage
                {
                    ShopId = day.ShopId,
                    NotificationType = NotificationType.ManualClosingSerialEntry,
                    Channel = NotificationChannel.Email,
                    Recipient = recipient,
                    Subject = subject,
                    Body = body,
                    RelatedEntityName = nameof(BusinessDay),
                    RelatedEntityId = day.Id
                }, cancellationToken);
                anySent = true;
            }
            catch
            {
                // Notification failures are logged by notification service and must not block day close.
            }
        }

        if (!anySent)
        {
            return;
        }

        try
        {
            var manualEntryIds = manualEntries.Select(x => x.Id).Distinct().ToArray();
            if (manualEntryIds.Length == 0)
            {
                return;
            }

            var notificationSentOn = DateTimeOffset.UtcNow;
            await _salesRepository.Query()
                .Where(x => manualEntryIds.Contains(x.Id))
                .ExecuteUpdateAsync(
                    setters => setters
                        .SetProperty(x => x.NotificationSent, true)
                        .SetProperty(x => x.NotificationSentOn, notificationSentOn),
                    cancellationToken);
        }
        catch
        {
            // Persisting notification metadata must not block day close.
        }
    }

    private async Task<List<string>> ResolveSummaryRecipientsAsync(Guid shopId, CancellationToken cancellationToken)
    {
        var recipients = await _shopUserRepository.Query()
            .AsNoTracking()
            .Where(x =>
                x.ShopId == shopId &&
                x.IsActive &&
                !string.IsNullOrWhiteSpace(x.User.Email) &&
                (x.Role.Name == RoleNames.CompanyOwner || x.Role.Name == RoleNames.Manager))
            .Select(x => x.User.Email)
            .ToListAsync(cancellationToken);

        if (recipients.Count == 0 && _currentUserService.UserId is Guid currentUserId)
        {
            var fallbackRecipient = await _shopUserRepository.Query()
                .AsNoTracking()
                .Where(x =>
                    x.ShopId == shopId &&
                    x.IsActive &&
                    x.UserId == currentUserId &&
                    !string.IsNullOrWhiteSpace(x.User.Email))
                .Select(x => x.User.Email)
                .FirstOrDefaultAsync(cancellationToken);

            if (!string.IsNullOrWhiteSpace(fallbackRecipient))
            {
                recipients.Add(fallbackRecipient);
            }
        }

        return recipients
            .Select(x => x.Trim())
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private sealed record SafeDropSummaryRow(
        string CanisterNumber,
        decimal Amount,
        string DroppedByName,
        string ShiftName,
        DateTimeOffset DroppedOn);

    // Latest temperature reading snapshot per active monitoring unit for the report's date.
    private sealed record TemperatureSummaryRow(
        string UnitName,
        string EquipmentType,
        string? Location,
        decimal MinTemperatureCelsius,
        decimal MaxTemperatureCelsius,
        decimal? LatestTemperatureCelsius,
        TimeOnly? LatestReadingTime,
        bool? IsOutOfRange);

    // Aggregate counters for daily compliance items — used in the day close report so the
    // owner sees overall coverage and any non-compliant items without listing each one.
    private sealed record ComplianceDailySummary(
        int TotalItems,
        int CompletedItems,
        int NonCompliantItems,
        int PendingItems);

    private async Task<TemperatureSummaryRow[]> LoadTemperatureSummaryForReportAsync(
        Guid shopId,
        DateOnly businessDate,
        CancellationToken cancellationToken)
    {
        var units = await _temperatureUnitRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && x.IsActive && !x.IsDeleted)
            .OrderBy(x => x.UnitName)
            .ToArrayAsync(cancellationToken);

        if (units.Length == 0)
        {
            return [];
        }

        var unitIds = units.Select(u => u.Id).ToArray();
        var readings = await _temperatureReadingRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId
                        && unitIds.Contains(x.TemperatureMonitoringUnitId)
                        && x.ReadingDate == businessDate)
            .ToArrayAsync(cancellationToken);

        var latestByUnit = readings
            .GroupBy(r => r.TemperatureMonitoringUnitId)
            .ToDictionary(g => g.Key, g => g.OrderByDescending(r => r.ReadingTime).First());

        return units
            .Select(unit =>
            {
                latestByUnit.TryGetValue(unit.Id, out var latest);
                return new TemperatureSummaryRow(
                    unit.UnitName,
                    unit.EquipmentType.ToString(),
                    unit.Location,
                    unit.MinTemperatureCelsius,
                    unit.MaxTemperatureCelsius,
                    latest?.TemperatureCelsius,
                    latest?.ReadingTime,
                    latest?.IsOutOfRange);
            })
            .ToArray();
    }

    private async Task<ComplianceDailySummary> LoadComplianceDailySummaryForReportAsync(
        Guid shopId,
        DateOnly businessDate,
        CancellationToken cancellationToken)
    {
        var totalItems = await _complianceCheckItemRepository.Query()
            .AsNoTracking()
            .CountAsync(x => x.ShopId == shopId
                              && x.IsActive
                              && !x.IsDeleted
                              && x.Frequency == ComplianceCheckFrequency.Daily,
                cancellationToken);

        if (totalItems == 0)
        {
            return new ComplianceDailySummary(0, 0, 0, 0);
        }

        var entries = await _complianceCheckEntryRepository.Query()
            .OfType<DailyComplianceCheckEntry>()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && x.CheckDate == businessDate)
            .Select(x => new { x.Result })
            .ToArrayAsync(cancellationToken);

        var completed = entries.Count(e => e.Result != ComplianceCheckResult.Pending);
        var nonCompliant = entries.Count(e => e.Result == ComplianceCheckResult.NonCompliant);
        return new ComplianceDailySummary(
            totalItems,
            completed,
            nonCompliant,
            Math.Max(totalItems - completed, 0));
    }

    private static List<EmailAttachment> BuildDayCloseAttachments(
        string shopName,
        BusinessDay day,
        IReadOnlyCollection<ShiftScratchCardSale> entries,
        IReadOnlyCollection<SafeDropSummaryRow> safeDropRows,
        bool safeDropManagementEnabled,
        IReadOnlyCollection<TemperatureSummaryRow> temperatureRows,
        ComplianceDailySummary complianceSummary,
        bool scratchCardEnabled)
    {
        var metaRows = new[]
        {
            new KeyValuePair<string, string>("Shop Name", shopName),
            new KeyValuePair<string, string>("Business Date", day.BusinessDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)),
            new KeyValuePair<string, string>("Report Date", $"{DateTimeOffset.UtcNow:yyyy-MM-dd HH:mm:ss} UTC"),
        };
        var fileSuffix = day.BusinessDate.ToString("yyyyMMdd", CultureInfo.InvariantCulture);
        var attachments = new List<EmailAttachment>();

        // Scratch Card — aggregated by display + game + price. Only emitted when the shop's plan
        // includes ScratchCardManagement and the module hasn't been disabled in shop settings.
        if (scratchCardEnabled)
        {
            var scratchRows = entries
                .Select(entry => new
                {
                    DisplayNumber = entry.Pack?.DisplayNumber,
                    GameName = entry.Pack?.Game?.GameName ?? "Unknown",
                    entry.TicketPrice,
                    entry.SoldQuantity,
                    entry.SalesAmount,
                })
                .GroupBy(x => new { x.DisplayNumber, x.GameName, x.TicketPrice })
                .Select(group => new
                {
                    group.Key.DisplayNumber,
                    group.Key.GameName,
                    group.Key.TicketPrice,
                    SoldQuantity = group.Sum(x => x.SoldQuantity),
                    SalesAmount = group.Sum(x => x.SalesAmount),
                })
                .OrderBy(x => x.DisplayNumber ?? int.MaxValue)
                .ThenBy(x => x.GameName, StringComparer.OrdinalIgnoreCase)
                .ToArray();
            var scratchTableRows = scratchRows
                .Select(row => (IReadOnlyList<string>)new[]
                {
                    row.DisplayNumber?.ToString(CultureInfo.InvariantCulture) ?? "-",
                    row.GameName,
                    row.TicketPrice.ToString("0.00", CultureInfo.InvariantCulture),
                    row.SoldQuantity.ToString(CultureInfo.InvariantCulture),
                    row.SalesAmount.ToString("0.00", CultureInfo.InvariantCulture),
                })
                .ToArray();
            var scratchTotalQty = scratchRows.Sum(x => x.SoldQuantity);
            var scratchTotalSales = scratchRows.Sum(x => x.SalesAmount);
            attachments.Add(new EmailAttachment
            {
                FileName = $"scratch-card-{fileSuffix}.pdf",
                ContentType = "application/pdf",
                Content = ReportPdfBuilder.BuildTableReport(
                    "Scratch Card Sales",
                    metaRows,
                    new[]
                    {
                        new ReportPdfBuilder.Column("Display", 90f),
                        new ReportPdfBuilder.Column("Game Name", 230f),
                        new ReportPdfBuilder.Column("Price", 90f, AlignRight: true),
                        new ReportPdfBuilder.Column("Qty", 80f, AlignRight: true),
                        new ReportPdfBuilder.Column("Sales", 110f, AlignRight: true),
                    },
                    scratchTableRows,
                    $"Total Qty: {scratchTotalQty.ToString(CultureInfo.InvariantCulture)}   Total Sales: £{scratchTotalSales.ToString("0.00", CultureInfo.InvariantCulture)}",
                    "No sales recorded for this day."),
            });
        }

        // Temperature.
        if (temperatureRows.Count > 0)
        {
            var tempTableRows = temperatureRows
                .Select(row =>
                {
                    var unitLabel = string.IsNullOrWhiteSpace(row.Location) ? row.UnitName : $"{row.UnitName} ({row.Location})";
                    var rangeText = $"{row.MinTemperatureCelsius.ToString("0.0", CultureInfo.InvariantCulture)}-{row.MaxTemperatureCelsius.ToString("0.0", CultureInfo.InvariantCulture)} C";
                    var readingText = row.LatestTemperatureCelsius is null
                        ? "-"
                        : $"{row.LatestTemperatureCelsius.Value.ToString("0.0", CultureInfo.InvariantCulture)} C" +
                          (row.LatestReadingTime is null ? string.Empty : $" at {row.LatestReadingTime.Value.ToString("HH:mm", CultureInfo.InvariantCulture)}");
                    var statusText = row.LatestTemperatureCelsius is null
                        ? "Pending"
                        : row.IsOutOfRange == true ? "Out of range" : "In range";
                    return (IReadOnlyList<string>)new[] { unitLabel, row.EquipmentType, rangeText, readingText, statusText };
                })
                .ToArray();
            var outOfRange = temperatureRows.Count(r => r.IsOutOfRange == true);
            var pending = temperatureRows.Count(r => r.LatestTemperatureCelsius is null);
            attachments.Add(new EmailAttachment
            {
                FileName = $"temperature-{fileSuffix}.pdf",
                ContentType = "application/pdf",
                Content = ReportPdfBuilder.BuildTableReport(
                    "Temperature Log",
                    metaRows,
                    new[]
                    {
                        new ReportPdfBuilder.Column("Unit", 200f),
                        new ReportPdfBuilder.Column("Equipment", 150f),
                        new ReportPdfBuilder.Column("Range", 120f),
                        new ReportPdfBuilder.Column("Latest Reading", 160f),
                        new ReportPdfBuilder.Column("Status", 110f),
                    },
                    tempTableRows,
                    $"Units: {temperatureRows.Count.ToString(CultureInfo.InvariantCulture)}   Out of range: {outOfRange.ToString(CultureInfo.InvariantCulture)}   Pending: {pending.ToString(CultureInfo.InvariantCulture)}",
                    "No monitoring units."),
            });
        }

        // Safe Drop.
        if (safeDropManagementEnabled)
        {
            var safeTableRows = safeDropRows
                .Select(row => (IReadOnlyList<string>)new[]
                {
                    string.IsNullOrWhiteSpace(row.CanisterNumber) ? "-" : row.CanisterNumber,
                    row.Amount.ToString("0.00", CultureInfo.InvariantCulture),
                    string.IsNullOrWhiteSpace(row.DroppedByName) ? "-" : row.DroppedByName,
                    string.IsNullOrWhiteSpace(row.ShiftName) ? "-" : row.ShiftName,
                    row.DroppedOn.ToUniversalTime().ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture),
                })
                .ToArray();
            var safeTotal = safeDropRows.Sum(x => x.Amount);
            attachments.Add(new EmailAttachment
            {
                FileName = $"safe-drop-{fileSuffix}.pdf",
                ContentType = "application/pdf",
                Content = ReportPdfBuilder.BuildTableReport(
                    "Safe Drop Detail",
                    metaRows,
                    new[]
                    {
                        new ReportPdfBuilder.Column("Canister", 130f),
                        new ReportPdfBuilder.Column("Amount", 100f, AlignRight: true),
                        new ReportPdfBuilder.Column("Dropped By", 220f),
                        new ReportPdfBuilder.Column("Shift", 160f),
                        new ReportPdfBuilder.Column("Dropped On (UTC)", 190f),
                    },
                    safeTableRows,
                    $"Total: £{safeTotal.ToString("0.00", CultureInfo.InvariantCulture)}   Entries: {safeDropRows.Count.ToString(CultureInfo.InvariantCulture)}",
                    "No safe drops recorded for this day."),
            });
        }

        // Compliance summary (counts only — not each record).
        if (complianceSummary.TotalItems > 0)
        {
            attachments.Add(new EmailAttachment
            {
                FileName = $"compliance-{fileSuffix}.pdf",
                ContentType = "application/pdf",
                Content = ReportPdfBuilder.BuildTableReport(
                    "Compliance Check Summary",
                    metaRows,
                    new[]
                    {
                        new ReportPdfBuilder.Column("Total Items", 150f, AlignRight: true),
                        new ReportPdfBuilder.Column("Completed", 150f, AlignRight: true),
                        new ReportPdfBuilder.Column("Pending", 150f, AlignRight: true),
                        new ReportPdfBuilder.Column("Non-Compliant", 150f, AlignRight: true),
                    },
                    new[]
                    {
                        (IReadOnlyList<string>)new[]
                        {
                            complianceSummary.TotalItems.ToString(CultureInfo.InvariantCulture),
                            complianceSummary.CompletedItems.ToString(CultureInfo.InvariantCulture),
                            complianceSummary.PendingItems.ToString(CultureInfo.InvariantCulture),
                            complianceSummary.NonCompliantItems.ToString(CultureInfo.InvariantCulture),
                        },
                    },
                    footerNote: null,
                    emptyMessage: null),
            });
        }

        return attachments;
    }

    private static string BuildDayCloseSummaryBodyHtml(
        string shopName,
        BusinessDay day,
        IReadOnlyCollection<Shift> shifts,
        IReadOnlyCollection<ShiftScratchCardSale> entries,
        int missingOpeningTicketCount,
        IReadOnlyCollection<SafeDropSummaryRow> safeDropRows,
        bool safeDropManagementEnabled,
        IReadOnlyCollection<TemperatureSummaryRow> temperatureRows,
        ComplianceDailySummary complianceSummary,
        bool scratchCardEnabled)
    {
        var rows = entries
            .Select(entry => new
            {
                DisplayNumber = entry.Pack?.DisplayNumber,
                GameName = entry.Pack?.Game?.GameName ?? "Unknown",
                TicketPrice = entry.TicketPrice,
                SoldQuantity = entry.SoldQuantity,
                SalesAmount = entry.SalesAmount
            })
            .GroupBy(x => new { x.DisplayNumber, x.GameName, x.TicketPrice })
            .Select(group => new
            {
                group.Key.DisplayNumber,
                group.Key.GameName,
                group.Key.TicketPrice,
                SoldQuantity = group.Sum(x => x.SoldQuantity),
                SalesAmount = group.Sum(x => x.SalesAmount)
            })
            .OrderBy(x => x.DisplayNumber ?? int.MaxValue)
            .ThenBy(x => x.GameName, StringComparer.OrdinalIgnoreCase)
            .ToArray();

        var totalSoldQty = rows.Sum(x => x.SoldQuantity);
        var totalSales = rows.Sum(x => x.SalesAmount);
        var summary = day.ScratchCardDayCloseSummary;
        var tillPayout = summary?.TillPayout ?? 0m;
        var tillBasedDifference = tillPayout - day.ExpectedCash;
        var shiftCount = shifts.Count;
        var shiftSalesById = entries
            .GroupBy(x => x.ShiftId)
            .ToDictionary(group => group.Key, group => group.Sum(x => x.SalesAmount));

        var orderedShifts = shifts
            .OrderBy(x => x.StartTime)
            .ThenBy(x => x.ShiftName, StringComparer.OrdinalIgnoreCase)
            .ToArray();

        var differenceClass = tillBasedDifference > 0.009m
            ? "variance-up"
            : tillBasedDifference < -0.009m
                ? "variance-down"
                : "variance-balanced";

        var shiftRowsHtml = orderedShifts.Length == 0
            ? "<tr><td colspan=\"4\" class=\"empty\">No shifts found.</td></tr>"
            : string.Join(
                string.Empty,
                orderedShifts.Select(shift =>
                {
                    var shiftSales = shiftSalesById.TryGetValue(shift.Id, out var total) ? total : 0m;
                    return
                        "<tr>" +
                        $"<td>{WebUtility.HtmlEncode(shift.ShiftName)}</td>" +
                        $"<td>{shift.StartTime.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture)}</td>" +
                        $"<td>{(shift.EndTime?.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture) ?? "-")}</td>" +
                        $"<td class=\"num\">{shiftSales.ToString("0.00", CultureInfo.InvariantCulture)}</td>" +
                        "</tr>";
                }));

        var salesRowsHtml = rows.Length == 0
            ? "<tr><td colspan=\"5\" class=\"empty\">No shift entries.</td></tr>"
            : string.Join(
                string.Empty,
                rows.Select(row =>
                {
                    var display = row.DisplayNumber.HasValue
                        ? row.DisplayNumber.Value.ToString(CultureInfo.InvariantCulture)
                        : "-";
                    return
                        "<tr>" +
                        $"<td>{display}</td>" +
                        $"<td>{WebUtility.HtmlEncode(row.GameName)}</td>" +
                        $"<td class=\"num\">{row.TicketPrice.ToString("0.00", CultureInfo.InvariantCulture)}</td>" +
                        $"<td class=\"num\">{row.SoldQuantity.ToString(CultureInfo.InvariantCulture)}</td>" +
                        $"<td class=\"num\">{row.SalesAmount.ToString("0.00", CultureInfo.InvariantCulture)}</td>" +
                        "</tr>";
                }));

        var safeDropTotalAmount = safeDropRows.Sum(x => x.Amount);
        var safeDropRowsHtml = safeDropRows.Count == 0
            ? "<tr><td colspan=\"5\" class=\"empty\">No safe drops recorded for this business day.</td></tr>"
            : string.Join(
                string.Empty,
                safeDropRows.Select(row =>
                {
                    var canisterNumber = string.IsNullOrWhiteSpace(row.CanisterNumber) ? "-" : row.CanisterNumber;
                    var droppedByName = string.IsNullOrWhiteSpace(row.DroppedByName) ? "-" : row.DroppedByName;
                    var shiftName = string.IsNullOrWhiteSpace(row.ShiftName) ? "-" : row.ShiftName;
                    var droppedOnUtc = row.DroppedOn.ToUniversalTime().ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture);
                    return
                        "<tr>" +
                        $"<td>{WebUtility.HtmlEncode(canisterNumber)}</td>" +
                        $"<td class=\"num\">{row.Amount.ToString("0.00", CultureInfo.InvariantCulture)}</td>" +
                        $"<td>{WebUtility.HtmlEncode(droppedByName)}</td>" +
                        $"<td>{WebUtility.HtmlEncode(shiftName)}</td>" +
                        $"<td>{WebUtility.HtmlEncode(droppedOnUtc)} UTC</td>" +
                        "</tr>";
                }));

        var sb = new StringBuilder();
        sb.Append("<html><head><style>");
        sb.Append("body{font-family:Arial,Helvetica,sans-serif;background:#f3f7fc;color:#152231;margin:0;padding:18px;}");
        sb.Append(".shell{max-width:1100px;margin:0 auto;background:#ffffff;border:1px solid #d8e2f0;border-radius:14px;overflow:hidden;}");
        sb.Append(".hero{padding:16px 18px;background:linear-gradient(135deg,#0f5ea7,#0d8aa5);color:#ffffff;}");
        sb.Append(".hero h2{margin:0;font-size:22px;line-height:28px;}");
        sb.Append(".hero p{margin:6px 0 0 0;font-size:13px;opacity:.95;}");
        sb.Append(".content{padding:16px 18px;}");
        sb.Append(".meta{width:100%;border-collapse:collapse;margin-bottom:14px;font-size:13px;}");
        sb.Append(".meta td{padding:6px 8px;border:1px solid #d8e2f0;}");
        sb.Append(".meta td:first-child{background:#eef4fc;font-weight:700;width:190px;color:#1f3a54;}");
        sb.Append(".cards{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;}");
        sb.Append(".card{flex:1;min-width:180px;background:#f2f7ff;border:1px solid #d8e2f0;border-radius:9px;padding:10px 8px;}");
        sb.Append(".card-label{font-size:11px;color:#54708c;text-transform:uppercase;letter-spacing:.35px;}");
        sb.Append(".card-value{margin-top:4px;font-size:19px;font-weight:700;color:#16324a;}");
        sb.Append(".variance-up .card-value{color:#8a5a05;}");
        sb.Append(".variance-down .card-value{color:#b4233c;}");
        sb.Append(".variance-balanced .card-value{color:#06795f;}");
        sb.Append(".table-title{font-size:15px;font-weight:700;color:#16324a;margin:2px 0 8px 0;}");
        sb.Append(".report-table{width:100%;border-collapse:collapse;margin-bottom:14px;font-size:13px;}");
        sb.Append(".report-table th,.report-table td{border:1px solid #d8e2f0;padding:8px;}");
        sb.Append(".report-table th{background:#e9f2ff;color:#1c3b5a;text-align:left;}");
        sb.Append(".report-table td{background:#ffffff;color:#1d2f41;}");
        sb.Append(".report-table tbody tr:nth-child(even) td{background:#f8fbff;}");
        sb.Append(".report-table td.num{text-align:right;font-variant-numeric:tabular-nums;}");
        sb.Append(".report-table td.empty{text-align:center;color:#607a93;background:#f8fbff;}");
        sb.Append(".report-table tfoot td{background:#eef6ff;font-weight:700;color:#10263a;}");
        sb.Append(".notes{margin-top:4px;padding:10px;border:1px solid #d8e2f0;background:#f8fbff;border-radius:9px;font-size:13px;color:#1d2f41;}");
        sb.Append("</style></head><body>");
        sb.Append("<div class=\"shell\">");
        sb.Append("<div class=\"hero\">");
        sb.Append("<h2>Day Close Report</h2>");
        sb.Append("</div>");
        sb.Append("<div class=\"content\">");
        sb.Append("<table class=\"meta\"><tbody>");
        sb.Append($"<tr><td>Shop Name</td><td>{WebUtility.HtmlEncode(shopName)}</td></tr>");
        sb.Append($"<tr><td>Business Date</td><td>{day.BusinessDate:yyyy-MM-dd}</td></tr>");
        sb.Append($"<tr><td>Closed Time</td><td>{(day.ClosedOn?.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture) ?? "-")} UTC</td></tr>");
        sb.Append($"<tr><td>Shifts Closed</td><td>{shiftCount}</td></tr>");
        if (scratchCardEnabled)
        {
            sb.Append($"<tr><td>Missing Scratch Card Tickets</td><td>{missingOpeningTicketCount.ToString(CultureInfo.InvariantCulture)}</td></tr>");
        }
        sb.Append("</tbody></table>");
        if (!string.IsNullOrWhiteSpace(day.Notes))
        {
            var noteHtml = WebUtility.HtmlEncode(day.Notes.Trim()).Replace("\r\n", "<br />").Replace("\n", "<br />");
            sb.Append("<div class=\"table-title\">Day Close Note</div>");
            sb.Append($"<div class=\"notes\">{noteHtml}</div>");
        }
        if (scratchCardEnabled)
        {
            sb.Append($"<div class=\"cards {differenceClass}\">");
            sb.Append($"<div class=\"card\"><div class=\"card-label\">Total Sales</div><div class=\"card-value\">{day.TotalSalesAmount.ToString("0.00", CultureInfo.InvariantCulture)}</div></div>");
            sb.Append($"<div class=\"card\"><div class=\"card-label\">Total Prize Payout</div><div class=\"card-value\">{day.TotalPrizePayout.ToString("0.00", CultureInfo.InvariantCulture)}</div></div>");
            sb.Append("</div>");
        }

        // sb.Append("<div class=\"table-title\">Day Close Metrics</div>");
        // sb.Append("<table class=\"report-table\"><thead><tr>");
        // sb.Append("<th>Metric</th><th class=\"num\">Amount</th>");
        // sb.Append("</tr></thead><tbody>");
        // sb.Append($"<tr><td>Lottery Machine Payout</td><td class=\"num\">{(summary?.LottoPayout ?? 0m).ToString("0.00", CultureInfo.InvariantCulture)}</td></tr>");
        // sb.Append($"<tr><td>Scratch Card Payout</td><td class=\"num\">{(summary?.ScratchCardPayout ?? 0m).ToString("0.00", CultureInfo.InvariantCulture)}</td></tr>");
        // sb.Append($"<tr><td>Till Payout</td><td class=\"num\">{tillPayout.ToString("0.00", CultureInfo.InvariantCulture)}</td></tr>");
        // sb.Append($"<tr><td>Missing Tickets (Opening Serial)</td><td class=\"num\">{missingOpeningTicketCount}</td></tr>");
        // sb.Append("</tbody></table>");

        sb.Append("<div class=\"table-title\">Shift Breakdown</div>");
        sb.Append("<table class=\"report-table\"><thead><tr>");
        sb.Append("<th>Shift</th><th>Start (UTC)</th><th>End (UTC)</th><th class=\"num\">Sales Total</th>");
        sb.Append("</tr></thead><tbody>");
        sb.Append(shiftRowsHtml);
        sb.Append("</tbody></table>");

        if (scratchCardEnabled)
        {
            sb.Append("<div class=\"table-title\">Scratch Card Sales by Display</div>");
            sb.Append("<table class=\"report-table\"><thead><tr>");
            sb.Append("<th>Display No</th><th>Game Name</th><th class=\"num\">Price</th><th class=\"num\">Sold Qty</th><th class=\"num\">Sales Total</th>");
            sb.Append("</tr></thead><tbody>");
            sb.Append(salesRowsHtml);
            sb.Append("</tbody><tfoot><tr>");
            sb.Append("<td colspan=\"3\" class=\"num\">Total</td>");
            sb.Append($"<td class=\"num\">{totalSoldQty.ToString(CultureInfo.InvariantCulture)}</td>");
            sb.Append($"<td class=\"num\">{totalSales.ToString("0.00", CultureInfo.InvariantCulture)}</td>");
            sb.Append("</tr></tfoot></table>");
        }

        if (safeDropManagementEnabled)
        {
            sb.Append("<div class=\"table-title\">Safe Drop Detail</div>");
            sb.Append("<table class=\"report-table\"><thead><tr>");
            sb.Append("<th>Canister</th><th class=\"num\">Amount</th><th>Dropped By</th><th>Shift</th><th>Dropped On (UTC)</th>");
            sb.Append("</tr></thead><tbody>");
            sb.Append(safeDropRowsHtml);
            sb.Append("</tbody><tfoot><tr>");
            sb.Append("<td class=\"num\">Total</td>");
            sb.Append($"<td class=\"num\">{safeDropTotalAmount.ToString("0.00", CultureInfo.InvariantCulture)}</td>");
            sb.Append($"<td colspan=\"3\">Entries: {safeDropRows.Count.ToString(CultureInfo.InvariantCulture)}</td>");
            sb.Append("</tr></tfoot></table>");
        }

        if (temperatureRows.Count > 0)
        {
            var outOfRange = temperatureRows.Count(r => r.IsOutOfRange == true);
            var pending = temperatureRows.Count(r => r.LatestTemperatureCelsius is null);

            sb.Append("<div class=\"table-title\">Temperature Log</div>");
            sb.Append("<table class=\"report-table\"><thead><tr>");
            sb.Append("<th>Unit</th><th>Equipment</th><th>Range</th><th>Latest Reading</th><th>Status</th>");
            sb.Append("</tr></thead><tbody>");
            foreach (var row in temperatureRows)
            {
                var unitLabel = string.IsNullOrWhiteSpace(row.Location)
                    ? row.UnitName
                    : $"{row.UnitName} ({row.Location})";
                var rangeText = $"{row.MinTemperatureCelsius.ToString("0.0", CultureInfo.InvariantCulture)}–{row.MaxTemperatureCelsius.ToString("0.0", CultureInfo.InvariantCulture)} °C";
                var readingText = row.LatestTemperatureCelsius is null
                    ? "—"
                    : $"{row.LatestTemperatureCelsius.Value.ToString("0.0", CultureInfo.InvariantCulture)} °C" +
                      (row.LatestReadingTime is null
                          ? string.Empty
                          : $" at {row.LatestReadingTime.Value.ToString("HH:mm", CultureInfo.InvariantCulture)}");
                var statusText = row.LatestTemperatureCelsius is null
                    ? "Pending"
                    : row.IsOutOfRange == true ? "Out of range" : "In range";
                sb.Append("<tr>");
                sb.Append($"<td>{WebUtility.HtmlEncode(unitLabel)}</td>");
                sb.Append($"<td>{WebUtility.HtmlEncode(row.EquipmentType)}</td>");
                sb.Append($"<td>{WebUtility.HtmlEncode(rangeText)}</td>");
                sb.Append($"<td>{WebUtility.HtmlEncode(readingText)}</td>");
                sb.Append($"<td>{WebUtility.HtmlEncode(statusText)}</td>");
                sb.Append("</tr>");
            }
            sb.Append("</tbody><tfoot><tr>");
            sb.Append($"<td colspan=\"5\">Units: {temperatureRows.Count.ToString(CultureInfo.InvariantCulture)} · Out of range: {outOfRange.ToString(CultureInfo.InvariantCulture)} · Pending: {pending.ToString(CultureInfo.InvariantCulture)}</td>");
            sb.Append("</tr></tfoot></table>");
        }

        if (complianceSummary.TotalItems > 0)
        {
            sb.Append("<div class=\"table-title\">Compliance Check Summary</div>");
            sb.Append("<table class=\"report-table\"><thead><tr>");
            sb.Append("<th>Total Items</th><th>Completed</th><th>Pending</th><th>Non-Compliant</th>");
            sb.Append("</tr></thead><tbody><tr>");
            sb.Append($"<td>{complianceSummary.TotalItems.ToString(CultureInfo.InvariantCulture)}</td>");
            sb.Append($"<td>{complianceSummary.CompletedItems.ToString(CultureInfo.InvariantCulture)}</td>");
            sb.Append($"<td>{complianceSummary.PendingItems.ToString(CultureInfo.InvariantCulture)}</td>");
            sb.Append($"<td>{complianceSummary.NonCompliantItems.ToString(CultureInfo.InvariantCulture)}</td>");
            sb.Append("</tr></tbody></table>");
        }

        if (!string.IsNullOrWhiteSpace(day.Notes))
        {
            sb.Append("<div class=\"notes\"><strong>Close Notes:</strong> ");
            sb.Append(WebUtility.HtmlEncode(day.Notes));
            sb.Append("</div>");
        }

        sb.Append("</div></div></body></html>");
        return sb.ToString();
    }

    private static string BuildDayCloseManualEntryByShiftBody(
        string shopName,
        BusinessDay day,
        IReadOnlyCollection<Shift> shifts,
        IReadOnlyCollection<ShiftScratchCardSale> manualEntries)
    {
        var shiftLookup = shifts.ToDictionary(x => x.Id, x => x);

        var rows = manualEntries
            .Select(entry =>
            {
                shiftLookup.TryGetValue(entry.ShiftId, out var shift);
                return new
                {
                    ShiftName = shift?.ShiftName ?? "Unknown Shift",
                    ShiftStart = shift?.StartTime ?? DateTimeOffset.MinValue,
                    DisplayNumber = entry.Pack?.DisplayNumber,
                    GameName = entry.Pack?.Game?.GameName ?? "Unknown",
                    ManualEntryValue = entry.ClosingSerialNumber
                };
            })
            .OrderBy(x => x.ShiftStart)
            .ThenBy(x => x.ShiftName, StringComparer.OrdinalIgnoreCase)
            .ThenBy(x => x.DisplayNumber ?? int.MaxValue)
            .ThenBy(x => x.GameName, StringComparer.OrdinalIgnoreCase)
            .ToArray();

        var sb = new StringBuilder();
        sb.AppendLine($"Shop: {shopName}");
        sb.AppendLine($"Business Date: {day.BusinessDate:yyyy-MM-dd}");
        sb.AppendLine($"Report Generated On (UTC): {DateTimeOffset.UtcNow:yyyy-MM-dd HH:mm:ss}");
        sb.AppendLine();

        foreach (var shiftGroup in rows.GroupBy(x => x.ShiftName))
        {
            sb.AppendLine($"Shift: {shiftGroup.Key}");
            sb.AppendLine("Display Number | Game | Manual Entry Value");
            foreach (var row in shiftGroup)
            {
                var display = row.DisplayNumber?.ToString(CultureInfo.InvariantCulture) ?? "-";
                sb.AppendLine($"{display} | {row.GameName} | {row.ManualEntryValue}");
            }

            sb.AppendLine();
        }

        return sb.ToString();
    }
}

