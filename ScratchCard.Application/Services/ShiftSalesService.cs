using System.Text;
using System.Globalization;
using System.Net;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Models;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.Services.Reporting;
using ScratchCard.Application.DTOs.ShiftSales;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Entities;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.Services;

public class ShiftSalesService : IShiftSalesService
{
    private readonly IRepository<Shift> _shiftRepository;
    private readonly IRepository<BusinessDay> _businessDayRepository;
    private readonly IRepository<ScratchCardPack> _packRepository;
    private readonly IRepository<ShiftOpeningSerial> _shiftOpeningSerialRepository;
    private readonly IRepository<ShiftScratchCardSale> _salesRepository;
    private readonly IRepository<ShiftPackClosing> _packClosingRepository;
    private readonly IRepository<PrizePayout> _payoutRepository;
    private readonly IRepository<ShiftReconciliation> _reconciliationRepository;
    private readonly IRepository<ShiftCloseAttachment> _shiftCloseAttachmentRepository;
    private readonly IRepository<CanisterDrop> _canisterDropRepository;
    private readonly IRepository<TemperatureMonitoringUnit> _temperatureUnitRepository;
    private readonly IRepository<TemperatureReading> _temperatureReadingRepository;
    private readonly IRepository<CfgDayCloseSettings> _dayCloseSettingsRepository;
    private readonly IRepository<CompanySubscription> _companySubscriptionRepository;
    private readonly IRepository<ShopUser> _shopUserRepository;
    private readonly IRepository<UserPushToken> _userPushTokenRepository;
    private readonly IRepository<Shop> _shopRepository;
    private readonly IShopConfigurationService _shopConfigurationService;
    private readonly ISerialCalculationService _serialCalculationService;
    private readonly INotificationService _notificationService;
    private readonly IShiftCloseNotificationDispatcher _shiftCloseNotificationDispatcher;
    private readonly IAuditService _auditService;
    private readonly ICurrentUserService _currentUserService;
    private readonly IAttachmentStorageService _attachmentStorageService;
    private readonly IFeatureGateService _featureGateService;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ILogger<ShiftSalesService> _logger;

    public ShiftSalesService(
        IRepository<Shift> shiftRepository,
        IRepository<BusinessDay> businessDayRepository,
        IRepository<ScratchCardPack> packRepository,
        IRepository<ShiftOpeningSerial> shiftOpeningSerialRepository,
        IRepository<ShiftScratchCardSale> salesRepository,
        IRepository<ShiftPackClosing> packClosingRepository,
        IRepository<PrizePayout> payoutRepository,
        IRepository<ShiftReconciliation> reconciliationRepository,
        IRepository<ShiftCloseAttachment> shiftCloseAttachmentRepository,
        IRepository<CanisterDrop> canisterDropRepository,
        IRepository<TemperatureMonitoringUnit> temperatureUnitRepository,
        IRepository<TemperatureReading> temperatureReadingRepository,
        IRepository<CfgDayCloseSettings> dayCloseSettingsRepository,
        IRepository<CompanySubscription> companySubscriptionRepository,
        IRepository<ShopUser> shopUserRepository,
        IRepository<UserPushToken> userPushTokenRepository,
        IRepository<Shop> shopRepository,
        IShopConfigurationService shopConfigurationService,
        ISerialCalculationService serialCalculationService,
        INotificationService notificationService,
        IShiftCloseNotificationDispatcher shiftCloseNotificationDispatcher,
        IAuditService auditService,
        ICurrentUserService currentUserService,
        IAttachmentStorageService attachmentStorageService,
        IFeatureGateService featureGateService,
        IUnitOfWork unitOfWork,
        ILogger<ShiftSalesService> logger)
    {
        _shiftRepository = shiftRepository;
        _businessDayRepository = businessDayRepository;
        _packRepository = packRepository;
        _shiftOpeningSerialRepository = shiftOpeningSerialRepository;
        _salesRepository = salesRepository;
        _packClosingRepository = packClosingRepository;
        _payoutRepository = payoutRepository;
        _reconciliationRepository = reconciliationRepository;
        _shiftCloseAttachmentRepository = shiftCloseAttachmentRepository;
        _canisterDropRepository = canisterDropRepository;
        _temperatureUnitRepository = temperatureUnitRepository;
        _temperatureReadingRepository = temperatureReadingRepository;
        _dayCloseSettingsRepository = dayCloseSettingsRepository;
        _companySubscriptionRepository = companySubscriptionRepository;
        _shopUserRepository = shopUserRepository;
        _userPushTokenRepository = userPushTokenRepository;
        _shopRepository = shopRepository;
        _shopConfigurationService = shopConfigurationService;
        _serialCalculationService = serialCalculationService;
        _notificationService = notificationService;
        _shiftCloseNotificationDispatcher = shiftCloseNotificationDispatcher;
        _auditService = auditService;
        _currentUserService = currentUserService;
        _attachmentStorageService = attachmentStorageService;
        _featureGateService = featureGateService;
        _unitOfWork = unitOfWork;
        _logger = logger;
    }

    public Task<ShiftCloseResultDto> SubmitShiftCloseSalesAsync(Guid shiftId, FinalizeShiftRequest request, CancellationToken cancellationToken = default)
        => FinalizeInternalAsync(shiftId, request, false, cancellationToken);

    public async Task<ShiftCloseResultDto> SyncOfflineShiftCloseAsync(OfflineSyncShiftCloseRequest request, CancellationToken cancellationToken = default)
    {
        try
        {
            return await FinalizeInternalAsync(request.ShiftId, request.Payload, true, cancellationToken);
        }
        catch (AppException ex) when (ex.Code is ErrorCodes.ShiftAlreadyClosed or ErrorCodes.ShiftNotOpen)
        {
            throw new AppException(ErrorCodes.OfflineSyncConflict, ex.Message, 409);
        }
    }

    public async Task<IReadOnlyCollection<ShiftSalesEntryDto>> GetShiftSalesAsync(Guid shiftId, CancellationToken cancellationToken = default)
    {
        var entries = await _salesRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShiftId == shiftId)
            .Select(x => new ShiftSalesEntryDto
            {
                Id = x.Id,
                PackId = x.PackId,
                PackNumber = x.Pack.PackNumber,
                OpeningSerialNumber = x.OpeningSerialNumber,
                ClosingSerialNumber = x.ClosingSerialNumber,
                OriginalScannedSerialNumber = x.OriginalScannedSerialNumber,
                EntryMethod = x.EntryMethod,
                SoldQuantity = x.SoldQuantity,
                TicketPrice = x.TicketPrice,
                SalesAmount = x.SalesAmount,
                RemainingTickets = x.RemainingTickets,
                IsFlaggedForReview = x.IsFlaggedForReview,
                NotificationSent = x.NotificationSent
            })
            .ToListAsync(cancellationToken);

        return entries;
    }

    public async Task<ShiftPackClosingDto> UpsertClosingNumberAsync(
        Guid shiftId,
        UpsertShiftPackClosingRequest request,
        CancellationToken cancellationToken = default)
    {
        var shift = await _shiftRepository.Query()
            .FirstOrDefaultAsync(x => x.Id == shiftId, cancellationToken)
            ?? throw new AppException("shift_not_found", "Shift not found.", 404);

        if (shift.Status is not (ShiftStatus.Open or ShiftStatus.Reopened))
        {
            throw new AppException(ErrorCodes.ShiftNotOpen, "Closing numbers can only be entered while the shift is open.");
        }

        var pack = await _packRepository.Query()
            .Include(x => x.Game)
            .FirstOrDefaultAsync(x => x.Id == request.PackId && x.ShopId == shift.ShopId && !x.IsDeleted, cancellationToken)
            ?? throw new AppException(ErrorCodes.PackNotFound, "Pack not found.", 404);

        if (pack.Status != PackStatus.Active)
        {
            throw new AppException(ErrorCodes.PackNotActive, $"Pack {pack.PackNumber} is not active.");
        }

        var closingSerial = (request.ClosingSerialNumber ?? string.Empty).Trim();
        if (closingSerial.Length == 0)
        {
            throw new AppException("closing_serial_required", "Closing serial number is required.", 400);
        }

        var existing = await _packClosingRepository.Query()
            .FirstOrDefaultAsync(x => x.ShiftId == shiftId && x.PackId == request.PackId, cancellationToken);

        var now = DateTimeOffset.UtcNow;
        if (existing is null)
        {
            existing = new ShiftPackClosing
            {
                ShiftId = shiftId,
                ShopId = shift.ShopId,
                PackId = request.PackId,
                EnteredByUserId = _currentUserService.UserId,
                EnteredOn = now,
            };
            existing.ClosingSerialNumber = closingSerial;
            existing.OriginalScannedSerialNumber = request.OriginalScannedSerialNumber;
            existing.EntryMethod = request.EntryMethod;
            existing.ManualEntryReason = request.ManualEntryReason;
            existing.Notes = request.Notes;
            await _packClosingRepository.AddAsync(existing, cancellationToken);
        }
        else
        {
            existing.ClosingSerialNumber = closingSerial;
            existing.OriginalScannedSerialNumber = request.OriginalScannedSerialNumber;
            existing.EntryMethod = request.EntryMethod;
            existing.ManualEntryReason = request.ManualEntryReason;
            existing.Notes = request.Notes;
            existing.ModifiedOn = now;
            existing.ModifiedBy = _currentUserService.UserId;
            _packClosingRepository.Update(existing);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        var openingSerial = await ResolveOpeningSerialAsync(shift, pack, cancellationToken);
        var packSetup = await _shopConfigurationService.GetPackSetupAsync(shift.ShopId, cancellationToken);
        return BuildClosingDto(existing, pack, openingSerial, packSetup.SellingOrder);
    }

    public async Task<IReadOnlyCollection<ShiftPackClosingDto>> ListClosingNumbersAsync(
        Guid shiftId,
        CancellationToken cancellationToken = default)
    {
        var shift = await _shiftRepository.Query()
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == shiftId, cancellationToken)
            ?? throw new AppException("shift_not_found", "Shift not found.", 404);

        var closings = await _packClosingRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShiftId == shiftId)
            .ToListAsync(cancellationToken);
        if (closings.Count == 0)
        {
            return [];
        }

        var packIds = closings.Select(x => x.PackId).ToArray();
        var packs = await _packRepository.Query()
            .AsNoTracking()
            .Include(x => x.Game)
            .Where(x => packIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, cancellationToken);

        var openingByPack = (await _shiftOpeningSerialRepository.Query()
                .AsNoTracking()
                .Where(x => x.ShiftId == shiftId && packIds.Contains(x.PackId))
                .ToListAsync(cancellationToken))
            .ToDictionary(x => x.PackId);

        var packSetup = await _shopConfigurationService.GetPackSetupAsync(shift.ShopId, cancellationToken);

        var result = new List<ShiftPackClosingDto>(closings.Count);
        foreach (var closing in closings)
        {
            if (!packs.TryGetValue(closing.PackId, out var pack))
            {
                continue;
            }

            var openingSerial = openingByPack.TryGetValue(closing.PackId, out var snapshot)
                ? snapshot.ActualOpeningSerialNumber
                : pack.CurrentSerialNumber;
            result.Add(BuildClosingDto(closing, pack, openingSerial, packSetup.SellingOrder));
        }

        return result
            .OrderBy(x => x.DisplayNumber ?? int.MaxValue)
            .ThenBy(x => x.GameName, StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    public async Task DeleteClosingNumberAsync(Guid shiftId, Guid packId, CancellationToken cancellationToken = default)
    {
        var existing = await _packClosingRepository.Query()
            .FirstOrDefaultAsync(x => x.ShiftId == shiftId && x.PackId == packId, cancellationToken);
        if (existing is null)
        {
            return;
        }

        _packClosingRepository.Remove(existing);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
    }

    private async Task<string> ResolveOpeningSerialAsync(Shift shift, ScratchCardPack pack, CancellationToken cancellationToken)
    {
        var snapshot = await _shiftOpeningSerialRepository.Query()
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.ShiftId == shift.Id && x.PackId == pack.Id, cancellationToken);
        return snapshot?.ActualOpeningSerialNumber ?? pack.CurrentSerialNumber;
    }

    private ShiftPackClosingDto BuildClosingDto(
        ShiftPackClosing closing,
        ScratchCardPack pack,
        string openingSerial,
        SellingOrder sellingOrder)
    {
        var calc = _serialCalculationService.Calculate(
            openingSerial,
            closing.ClosingSerialNumber,
            pack.StartSerialNumber,
            pack.EndSerialNumber,
            sellingOrder,
            pack.TicketPrice,
            pack.TotalTickets);

        return new ShiftPackClosingDto
        {
            PackId = pack.Id,
            PackNumber = pack.PackNumber,
            DisplayNumber = pack.DisplayNumber,
            GameName = pack.Game?.GameName ?? "Unknown",
            OpeningSerialNumber = openingSerial,
            ClosingSerialNumber = closing.ClosingSerialNumber,
            OriginalScannedSerialNumber = closing.OriginalScannedSerialNumber,
            EntryMethod = closing.EntryMethod,
            ManualEntryReason = closing.ManualEntryReason,
            Notes = closing.Notes,
            SoldQuantity = calc.SoldQuantity,
            TicketPrice = pack.TicketPrice,
            SalesAmount = calc.SalesAmount,
            RemainingTickets = calc.RemainingTickets,
            EnteredOn = closing.EnteredOn,
        };
    }

    public async Task SendShiftCloseNotificationsAsync(
        Guid shiftId,
        bool includeManualEntryNotifications,
        CancellationToken cancellationToken = default)
    {
        var shift = await _shiftRepository.Query()
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == shiftId, cancellationToken);
        if (shift is null)
        {
            return;
        }

        var businessDay = await _businessDayRepository.Query()
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == shift.BusinessDayId, cancellationToken);
        if (businessDay is null)
        {
            return;
        }

        var entries = await _salesRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShiftId == shift.Id)
            .Include(x => x.Pack)
                .ThenInclude(x => x.Game)
            .ToListAsync(cancellationToken);

        var packs = entries
            .Where(x => x.Pack is not null)
            .GroupBy(x => x.PackId)
            .ToDictionary(group => group.Key, group => group.First().Pack!);

        if (includeManualEntryNotifications)
        {
            await SendManualEntryNotificationsAsync(shift, businessDay, entries, cancellationToken);
        }

        await SendSuspiciousActivityAlertsAsync(shift, businessDay, entries, cancellationToken);

        await SendShiftClosePushNotificationsAsync(shift, businessDay, entries, cancellationToken);
        await SendShiftCloseSummaryToOwnersAsync(shift, businessDay, entries, packs, cancellationToken);
    }

    private async Task SendSuspiciousActivityAlertsAsync(
        Shift shift,
        BusinessDay businessDay,
        IReadOnlyCollection<ShiftScratchCardSale> entries,
        CancellationToken cancellationToken)
    {
        // Suspicious-activity alerts are a Pro feature.
        if (!await _featureGateService.HasFeatureAsync(shift.ShopId, FeatureKeys.ScratchCardSuspiciousAlerts, cancellationToken))
        {
            return;
        }

        // Heuristic: a single shift selling >50% of a pack's total tickets is unusual and worth a
        // manager glance. Keep the rule deliberately simple — false positives cost less than
        // letting genuine fraud slip past.
        var suspicious = entries
            .Where(e => e.Pack is not null && e.Pack.TotalTickets > 0 && e.SoldQuantity > e.Pack.TotalTickets / 2)
            .ToArray();
        if (suspicious.Length == 0) return;

        var recipients = await _shopUserRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shift.ShopId && x.IsActive && (x.Role.Name == "CompanyOwner" || x.Role.Name == "Manager"))
            .Include(x => x.Role).Include(x => x.User)
            .Select(x => x.User.Email).Distinct()
            .ToListAsync(cancellationToken);
        if (recipients.Count == 0) return;

        var sb = new StringBuilder();
        sb.AppendLine($"Shift: {shift.ShiftName} | Business date: {businessDay.BusinessDate}");
        sb.AppendLine();
        sb.AppendLine("The following sales exceed 50% of pack capacity in a single shift and warrant review:");
        foreach (var e in suspicious)
        {
            sb.AppendLine($" - Pack {e.Pack!.PackNumber} ({e.Pack.Game?.GameName ?? "Unknown game"}): sold {e.SoldQuantity}/{e.Pack.TotalTickets} ({(decimal)e.SoldQuantity / e.Pack.TotalTickets * 100:F1}%)");
        }

        foreach (var recipient in recipients)
        {
            try
            {
                await _notificationService.SendAsync(new NotificationMessage
                {
                    ShopId = shift.ShopId,
                    NotificationType = NotificationType.SuspiciousScratchCardActivity,
                    Channel = NotificationChannel.Email,
                    Recipient = recipient,
                    Subject = $"Suspicious scratch-card activity - {shift.ShiftName}",
                    Body = sb.ToString(),
                    RelatedEntityName = nameof(Shift),
                    RelatedEntityId = shift.Id
                }, cancellationToken);
            }
            catch
            {
                // Alert failures must not block shift close.
            }
        }
    }

    private async Task<ShiftCloseResultDto> FinalizeInternalAsync(Guid shiftId, FinalizeShiftRequest request, bool isOfflineSync, CancellationToken cancellationToken)
    {
        var shift = await _shiftRepository.Query()
            .FirstOrDefaultAsync(x => x.Id == shiftId, cancellationToken)
            ?? throw new AppException("shift_not_found", "Shift not found.", 404);

        if (shift.Status == ShiftStatus.Closed)
        {
            throw new AppException(ErrorCodes.ShiftAlreadyClosed, "Shift is already closed.");
        }

        if (shift.Status is not (ShiftStatus.Open or ShiftStatus.Reopened))
        {
            throw new AppException(ErrorCodes.ShiftNotOpen, "Shift is not open.");
        }

        var businessDay = await _businessDayRepository.GetByIdAsync(shift.BusinessDayId, cancellationToken)
            ?? throw new AppException("business_day_not_found", "Business day not found.", 404);

        if (businessDay.Status == BusinessDayStatus.Closed)
        {
            throw new AppException("business_day_closed", "Business day is already closed.");
        }

        var closeActionOn = DateTimeOffset.UtcNow;
        var businessDaySetup = await _shopConfigurationService.GetBusinessDaySetupAsync(shift.ShopId, cancellationToken);

        // Closing numbers are entered on the dedicated screen and persisted to the staging
        // store; finalize consumes whatever is stored. The offline-sync path still carries
        // entries inline in its payload (the device couldn't reach the staging endpoint), so
        // honour those when present.
        var entries = request.Entries.Count > 0
            ? request.Entries.ToList()
            : (await _packClosingRepository.Query()
                .Where(x => x.ShiftId == shift.Id)
                .ToListAsync(cancellationToken))
                .Select(closing => new ShiftClosePackEntryRequest
                {
                    PackId = closing.PackId,
                    ClosingSerialNumber = closing.ClosingSerialNumber,
                    OriginalScannedSerialNumber = closing.OriginalScannedSerialNumber,
                    EntryMethod = closing.EntryMethod,
                    ManualEntryReason = closing.ManualEntryReason,
                    Notes = closing.Notes,
                })
                .ToList();

        var packIds = entries.Select(x => x.PackId).Distinct().ToArray();
        var packs = await _packRepository.Query()
            .Where(x => packIds.Contains(x.Id) && x.ShopId == shift.ShopId && !x.IsDeleted)
            .Include(x => x.Game)
            .ToDictionaryAsync(x => x.Id, cancellationToken);

        if (packs.Count != packIds.Length)
        {
            throw new AppException(ErrorCodes.PackNotFound, "One or more packs were not found.");
        }

        var packSetup = await _shopConfigurationService.GetPackSetupAsync(shift.ShopId, cancellationToken);

        foreach (var pack in packs.Values)
        {
            if (pack.Status != PackStatus.Active)
            {
                throw new AppException(ErrorCodes.PackNotActive, $"Pack {pack.PackNumber} is not active.");
            }
        }

        // Plans with scratch_card.manual_correction_reasons require a reason whenever a manual
        // or edited entry is submitted. Below that tier, the reason field is accepted but
        // optional.
        var requireManualReason = await _featureGateService.HasFeatureAsync(
            shift.ShopId,
            FeatureKeys.ScratchCardManualCorrectionReasons,
            cancellationToken);
        if (requireManualReason)
        {
            foreach (var entry in entries)
            {
                var entryIsManualOrEdited = entry.EntryMethod == EntryMethod.Manual
                    || entry.EntryMethod == EntryMethod.ScannedEdited
                    || (!string.IsNullOrWhiteSpace(entry.OriginalScannedSerialNumber) &&
                        !string.Equals(entry.OriginalScannedSerialNumber, entry.ClosingSerialNumber, StringComparison.OrdinalIgnoreCase));
                if (entryIsManualOrEdited && string.IsNullOrWhiteSpace(entry.ManualEntryReason))
                {
                    throw new AppException(
                        "manual_correction_reason_required",
                        "Your subscription plan requires a reason for every manual or edited closing-serial entry.",
                        400);
                }
            }
        }

        // Plans with scratch_card.advanced_validation enforce a strict serial-range check:
        // the closing serial must lie within [start, end] of the pack and the resulting sold
        // quantity must be non-negative. The default validator silently clamps; strict mode
        // surfaces a 400 so the user must correct the entry.
        var strictValidation = await _featureGateService.HasFeatureAsync(
            shift.ShopId,
            FeatureKeys.ScratchCardAdvancedValidation,
            cancellationToken);

        var openingSerialByPackId = (await _shiftOpeningSerialRepository.Query()
            .Where(x => x.ShiftId == shift.Id && packIds.Contains(x.PackId))
            .ToListAsync(cancellationToken))
            .ToDictionary(x => x.PackId);
        var openingSerialRowsToCreate = new List<ShiftOpeningSerial>();

        var existingSales = await _salesRepository.Query()
            .Where(x => x.ShiftId == shift.Id)
            .ToListAsync(cancellationToken);

        foreach (var sale in existingSales)
        {
            _salesRepository.Remove(sale);
        }

        var salesEntries = new List<ShiftScratchCardSale>();
        foreach (var entry in entries)
        {
            if (!packs.TryGetValue(entry.PackId, out var pack))
            {
                throw new AppException(ErrorCodes.PackNotFound, "Referenced pack was not found.");
            }

            var hasOpeningSnapshot = openingSerialByPackId.TryGetValue(pack.Id, out var openingSnapshot);
            var openingSerial = hasOpeningSnapshot
                ? openingSnapshot!.ActualOpeningSerialNumber
                : pack.CurrentSerialNumber;

            // Keep ShiftOpeningSerial in sync with closed entries. Older shifts may not have
            // snapshot rows yet, so we create them during close to maintain complete history.
            if (!hasOpeningSnapshot)
            {
                openingSnapshot = new ShiftOpeningSerial
                {
                    ShiftId = shift.Id,
                    BusinessDayId = shift.BusinessDayId,
                    ShopId = shift.ShopId,
                    PackId = pack.Id,
                    ExpectedOpeningSerialNumber = openingSerial,
                    ActualOpeningSerialNumber = openingSerial,
                    MissingQuantity = 0,
                    OverageQuantity = 0,
                    CreatedOn = DateTimeOffset.UtcNow,
                    CreatedBy = _currentUserService.UserId
                };

                openingSerialRowsToCreate.Add(openingSnapshot);
                openingSerialByPackId[pack.Id] = openingSnapshot;
            }
            else
            {
                openingSnapshot!.ActualOpeningSerialNumber = openingSerial;
                openingSnapshot.ModifiedOn = DateTimeOffset.UtcNow;
                openingSnapshot.ModifiedBy = _currentUserService.UserId;
                _shiftOpeningSerialRepository.Update(openingSnapshot);
            }

            var calc = _serialCalculationService.Calculate(
                openingSerial,
                entry.ClosingSerialNumber,
                pack.StartSerialNumber,
                pack.EndSerialNumber,
                packSetup.SellingOrder,
                pack.TicketPrice,
                pack.TotalTickets);

            if (strictValidation)
            {
                if (!int.TryParse(entry.ClosingSerialNumber, out var closingNum) ||
                    !int.TryParse(pack.StartSerialNumber, out var startNum) ||
                    !int.TryParse(pack.EndSerialNumber, out var endNum))
                {
                    throw new AppException(
                        "strict_serial_invalid",
                        $"Closing serial '{entry.ClosingSerialNumber}' for pack {pack.PackNumber} is not numeric. Your plan's strict validator rejects non-numeric serials.",
                        400);
                }
                var (lo, hi) = startNum <= endNum ? (startNum, endNum) : (endNum, startNum);
                if (closingNum < lo || closingNum > hi)
                {
                    throw new AppException(
                        "strict_serial_out_of_range",
                        $"Closing serial {closingNum} for pack {pack.PackNumber} is outside the pack's range [{lo}, {hi}].",
                        400);
                }
                if (calc.SoldQuantity < 0)
                {
                    throw new AppException(
                        "strict_serial_negative_sold",
                        $"Closing serial {closingNum} for pack {pack.PackNumber} would imply a negative sold quantity ({calc.SoldQuantity}).",
                        400);
                }
            }

            var isScannedEdited = entry.EntryMethod == EntryMethod.ScannedEdited ||
                                  (!string.IsNullOrWhiteSpace(entry.OriginalScannedSerialNumber) &&
                                   !string.Equals(entry.OriginalScannedSerialNumber, entry.ClosingSerialNumber, StringComparison.OrdinalIgnoreCase));

            var isManual = entry.EntryMethod == EntryMethod.Manual;

            var persistedEntryMethod = isManual
                ? EntryMethod.Manual
                : isScannedEdited ? EntryMethod.ScannedEdited : EntryMethod.Scanned;

            salesEntries.Add(new ShiftScratchCardSale
            {
                ShiftId = shift.Id,
                ShopId = shift.ShopId,
                PackId = pack.Id,
                OpeningSerialNumber = openingSerial,
                ClosingSerialNumber = entry.ClosingSerialNumber,
                OriginalScannedSerialNumber = entry.OriginalScannedSerialNumber,
                SellingOrder = packSetup.SellingOrder,
                EntryMethod = persistedEntryMethod,
                SoldQuantity = calc.SoldQuantity,
                TicketPrice = pack.TicketPrice,
                SalesAmount = calc.SalesAmount,
                RemainingTickets = calc.RemainingTickets,
                IsManualEntry = isManual,
                IsScannedEdited = isScannedEdited,
                IsFlaggedForReview = isManual || isScannedEdited,
                ManualEntryReason = entry.ManualEntryReason,
                NotificationRequired = isManual || isScannedEdited,
                NotificationSent = false,
                EnteredByUserId = _currentUserService.UserId ?? Guid.Empty,
                EnteredOn = DateTimeOffset.UtcNow,
                Notes = entry.Notes
            });

            pack.CurrentSerialNumber = entry.ClosingSerialNumber;
            pack.SellingOrder = packSetup.SellingOrder;
            if ((packSetup.SellingOrder == SellingOrder.Ascending && pack.CurrentSerialNumber == pack.EndSerialNumber) ||
                (packSetup.SellingOrder == SellingOrder.Descending && pack.CurrentSerialNumber == pack.StartSerialNumber))
            {
                pack.Status = PackStatus.Completed;
                pack.CompletedDate = DateTimeOffset.UtcNow;
            }

            _packRepository.Update(pack);
        }

        if (openingSerialRowsToCreate.Count > 0)
        {
            await _shiftOpeningSerialRepository.AddRangeAsync(openingSerialRowsToCreate, cancellationToken);
        }

        await _salesRepository.AddRangeAsync(salesEntries, cancellationToken);

        // Staging rows have been consumed into the final sales — clear them so a reopened
        // shift starts fresh rather than replaying stale closing numbers.
        var stagedClosings = await _packClosingRepository.Query()
            .Where(x => x.ShiftId == shift.Id)
            .ToListAsync(cancellationToken);
        foreach (var staged in stagedClosings)
        {
            _packClosingRepository.Remove(staged);
        }

        var totalSales = salesEntries.Sum(x => x.SalesAmount);
        var totalPrizePayout = await _payoutRepository.Query()
            .Where(x => x.ShiftId == shift.Id)
            .SumAsync(x => x.PrizeAmount, cancellationToken);

        var expectedCash = totalSales - totalPrizePayout;
        var difference = -expectedCash;

        var reconciliation = await _reconciliationRepository.Query()
            .FirstOrDefaultAsync(x => x.ShiftId == shift.Id, cancellationToken);
        var isNewReconciliation = reconciliation is null;

        if (isNewReconciliation)
        {
            reconciliation = new ShiftReconciliation
            {
                ShiftId = shift.Id,
                ShopId = shift.ShopId,
                SubmittedByUserId = _currentUserService.UserId ?? Guid.Empty,
                SubmittedOn = DateTimeOffset.UtcNow
            };
        }

        if (reconciliation is null)
        {
            throw new AppException("reconciliation_not_found", "Unable to create or load shift reconciliation.");
        }

        reconciliation.TotalSalesAmount = totalSales;
        reconciliation.TotalPrizePayout = totalPrizePayout;
        reconciliation.ExpectedCash = expectedCash;
        reconciliation.Difference = difference;
        reconciliation.Status = ReconciliationStatus.Submitted;
        reconciliation.Notes = request.Notes;

        if (isNewReconciliation)
        {
            await _reconciliationRepository.AddAsync(reconciliation, cancellationToken);
        }
        else
        {
            _reconciliationRepository.Update(reconciliation);
        }

        var existingAttachments = await _shiftCloseAttachmentRepository.Query()
            .Where(x => x.ShiftReconciliationId == reconciliation.Id)
            .ToListAsync(cancellationToken);

        foreach (var existingAttachment in existingAttachments)
        {
            await _attachmentStorageService.DeleteIfExistsAsync(existingAttachment.StoredPath, cancellationToken);
            _shiftCloseAttachmentRepository.Remove(existingAttachment);
        }

        var attachmentInputs = CloseAttachmentStorage.BuildInputs(
            request.Attachments,
            request.AttachmentFileName,
            request.AttachmentBase64);
        if (attachmentInputs.Count > 0)
        {
            // Attaching files to the shift-close report is a Growth+ feature.
            await _featureGateService.EnsureFeatureAsync(shift.ShopId, FeatureKeys.ScratchCardAttachments, cancellationToken);

            var savedAttachments = await CloseAttachmentStorage.SaveShiftAttachmentsAsync(
                attachmentInputs,
                _attachmentStorageService,
                shift.ShopId,
                businessDay.BusinessDate,
                shift.ShiftName,
                cancellationToken);

            var now = DateTimeOffset.UtcNow;
            var createdBy = _currentUserService.UserId;
            var closeAttachments = savedAttachments.Select(saved => new ShiftCloseAttachment
            {
                ShiftReconciliationId = reconciliation.Id,
                ShopId = shift.ShopId,
                OriginalFileName = saved.OriginalFileName,
                StoredFileName = saved.StoredFileName,
                StoredPath = saved.StoredPath,
                ContentType = saved.ContentType,
                FileSizeBytes = saved.FileSizeBytes,
                CreatedOn = now,
                CreatedBy = createdBy
            }).ToArray();

            await _shiftCloseAttachmentRepository.AddRangeAsync(closeAttachments, cancellationToken);
        }

        shift.Status = ShiftStatus.Closed;
        shift.SyncStatus = SyncStatus.Synced;
        if (!shift.EndTime.HasValue)
        {
            shift.EndTime = closeActionOn;
        }

        shift.ClosedOn = closeActionOn;
        shift.ClosedByUserId = _currentUserService.UserId;
        shift.ModifiedOn = closeActionOn;
        shift.ModifiedBy = _currentUserService.UserId;
        _shiftRepository.Update(shift);

        var effectiveShiftEnd = shift.EndTime ?? closeActionOn;
        var shouldMoveDayManagementToNextBusinessDate = ShouldMoveDayManagementToNextBusinessDate(
            effectiveShiftEnd,
            businessDaySetup.TimeZoneId,
            businessDaySetup.BusinessEndTime);
        var nextBusinessDate = shouldMoveDayManagementToNextBusinessDate
            ? businessDay.BusinessDate.AddDays(1)
            : (DateOnly?)null;

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        var hasFlags = salesEntries.Any(x => x.NotificationRequired);
        try
        {
            await _shiftCloseNotificationDispatcher.EnqueueAsync(
                new ShiftCloseNotificationWorkItem
                {
                    ShiftId = shift.Id,
                    IncludeManualEntryNotifications = false
                },
                CancellationToken.None);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to enqueue shift close notifications for shift {ShiftId}", shift.Id);
            try
            {
                // Fallback ensures notification delivery when background queue is temporarily unavailable.
                await SendShiftCloseNotificationsAsync(shift.Id, includeManualEntryNotifications: false, cancellationToken);
            }
            catch (Exception fallbackEx)
            {
                _logger.LogError(fallbackEx, "Fallback shift close notification dispatch failed for shift {ShiftId}", shift.Id);
            }
        }

        await _auditService.LogAsync(
            nameof(Shift),
            shift.Id,
            isOfflineSync ? "OfflineShiftSynced" : "ShiftClosed",
            shift.ShopId,
            cancellationToken: cancellationToken);

        return new ShiftCloseResultDto
        {
            ShiftId = shift.Id,
            TotalSalesAmount = totalSales,
            TotalPrizePayout = totalPrizePayout,
            ExpectedCash = expectedCash,
            Difference = difference,
            HasManualOrEditedEntries = hasFlags,
            MoveDayManagementToNextBusinessDate = shouldMoveDayManagementToNextBusinessDate,
            NextBusinessDate = nextBusinessDate
        };
    }

    private static bool ShouldMoveDayManagementToNextBusinessDate(
        DateTimeOffset shiftEndTimeUtc,
        string? timeZoneId,
        TimeSpan configuredBusinessEndTime)
    {
        var shiftLocalTime = ConvertToShopTime(shiftEndTimeUtc, timeZoneId);
        var endTime = shiftLocalTime.TimeOfDay;
        return endTime.Hours == configuredBusinessEndTime.Hours &&
               endTime.Minutes == configuredBusinessEndTime.Minutes;
    }

    private static DateTimeOffset ConvertToShopTime(DateTimeOffset utcNow, string? timeZoneId)
    {
        var timeZone = ResolveTimeZone(timeZoneId);
        return timeZone is null ? utcNow : TimeZoneInfo.ConvertTime(utcNow, timeZone);
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

    private async Task SendShiftCloseSummaryToOwnersAsync(
        Shift shift,
        BusinessDay businessDay,
        IReadOnlyCollection<ShiftScratchCardSale> entries,
        IReadOnlyDictionary<Guid, ScratchCardPack> packs,
        CancellationToken cancellationToken)
    {
        var recipients = await ResolveSummaryRecipientsAsync(shift.ShopId, cancellationToken);

        if (recipients.Count == 0)
        {
            return;
        }

        var shopName = await _shopRepository.Query()
            .AsNoTracking()
            .Where(x => x.Id == shift.ShopId)
            .Select(x => x.ShopName)
            .FirstOrDefaultAsync(cancellationToken) ?? "Unknown Shop";

        var safeDropManagementEnabled = await IsSafeDropManagementEnabledAsync(shift.ShopId, cancellationToken);
        var safeDropRows = safeDropManagementEnabled
            ? await _canisterDropRepository.Query()
                .AsNoTracking()
                .Where(x => x.BusinessDayId == businessDay.Id && x.ShiftId == shift.Id)
                .OrderByDescending(x => x.DroppedOn)
                .ThenByDescending(x => x.CreatedOn)
                .Select(x => new SafeDropSummaryRow(
                    x.Canister.CanisterNumber,
                    x.Amount,
                    x.DroppedByName,
                    x.DroppedOn))
                .ToArrayAsync(cancellationToken)
            : [];

        var summaryRows = BuildShiftCloseSummaryRows(entries, packs);
        var temperatureRows = await LoadTemperatureSummaryRowsAsync(shift.ShopId, businessDay.BusinessDate, cancellationToken);
        var reportGeneratedOnUtc = DateTimeOffset.UtcNow;
        var subject = $"Shift Close Summary - {shopName} - {businessDay.BusinessDate:yyyy-MM-dd} - {shift.ShiftName}";
        var body = BuildShiftCloseSummaryBodyHtml(
            shopName,
            shift,
            businessDay,
            summaryRows,
            safeDropRows,
            safeDropManagementEnabled,
            temperatureRows,
            reportGeneratedOnUtc);

        // One PDF per report section, attached as separate files (Scratch Card, Temperature,
        // Safe Drop). The HTML email body still carries every section inline.
        var metaRows = new[]
        {
            new KeyValuePair<string, string>("Shop Name", shopName),
            new KeyValuePair<string, string>("Shift Detail", $"{shift.ShiftName} ({businessDay.BusinessDate:yyyy-MM-dd})"),
            new KeyValuePair<string, string>("Report Date", $"{reportGeneratedOnUtc:yyyy-MM-dd HH:mm:ss} UTC"),
        };
        var fileSuffix = BuildShiftReportFileSuffix(shift, businessDay);
        var attachments = new List<EmailAttachment>
        {
            new()
            {
                FileName = $"scratch-card-{fileSuffix}.pdf",
                ContentType = "application/pdf",
                Content = BuildScratchCardSectionPdf(metaRows, summaryRows),
            },
        };

        if (temperatureRows.Length > 0)
        {
            attachments.Add(new EmailAttachment
            {
                FileName = $"temperature-{fileSuffix}.pdf",
                ContentType = "application/pdf",
                Content = BuildTemperatureSectionPdf(metaRows, temperatureRows),
            });
        }

        if (safeDropManagementEnabled)
        {
            attachments.Add(new EmailAttachment
            {
                FileName = $"safe-drop-{fileSuffix}.pdf",
                ContentType = "application/pdf",
                Content = BuildSafeDropSectionPdf(metaRows, safeDropRows),
            });
        }

        foreach (var recipient in recipients)
        {
            try
            {
                await _notificationService.SendAsync(new NotificationMessage
                {
                    ShopId = shift.ShopId,
                    NotificationType = NotificationType.ShiftCloseSummary,
                    Channel = NotificationChannel.Email,
                    Recipient = recipient,
                    Subject = subject,
                    Body = body,
                    IsBodyHtml = true,
                    Attachments = attachments,
                    RelatedEntityName = nameof(Shift),
                    RelatedEntityId = shift.Id
                }, cancellationToken);
            }
            catch
            {
                // Notification failures are logged by notification service and must not block shift close.
            }
        }
    }

    private async Task SendShiftClosePushNotificationsAsync(
        Shift shift,
        BusinessDay businessDay,
        IReadOnlyCollection<ShiftScratchCardSale> entries,
        CancellationToken cancellationToken)
    {
        var recipientUserIds = await _shopUserRepository.Query()
            .AsNoTracking()
            .Where(
                x =>
                    x.ShopId == shift.ShopId &&
                    x.IsActive &&
                    (x.Role.Name == RoleNames.CompanyOwner || x.Role.Name == RoleNames.Manager))
            .Select(x => x.UserId)
            .Distinct()
            .ToArrayAsync(cancellationToken);
        if (recipientUserIds.Length == 0)
        {
            _logger.LogInformation(
                "Shift close push skipped for shift {ShiftId}: no active manager/company owner users for shop {ShopId}.",
                shift.Id,
                shift.ShopId);
            return;
        }

        var recipientTokens = await _userPushTokenRepository.Query()
            .AsNoTracking()
            .Where(
                x =>
                    x.ShopId == shift.ShopId &&
                    x.IsActive &&
                    recipientUserIds.Contains(x.UserId) &&
                    (x.Platform.ToLower() == "fcm" || x.Platform.ToLower() == "android" || x.Platform.ToLower() == "ios"))
            .Select(x => x.PushToken)
            .Distinct()
            .ToArrayAsync(cancellationToken);
        if (recipientTokens.Length == 0)
        {
            _logger.LogInformation(
                "Shift close push skipped for shift {ShiftId}: no active FCM tokens for manager/company owner users in shop {ShopId}.",
                shift.Id,
                shift.ShopId);
            return;
        }

        var shopName = await _shopRepository.Query()
            .AsNoTracking()
            .Where(x => x.Id == shift.ShopId)
            .Select(x => x.ShopName)
            .FirstOrDefaultAsync(cancellationToken) ?? "Shop";

        var totalSales = entries.Sum(x => x.SalesAmount);
        var subject = $"Shift Closed - {shopName}";
        var body = $"Shift {shift.ShiftName} for {businessDay.BusinessDate:yyyy-MM-dd} is closed. Total scratch card sales: {totalSales:0.00}.";

        foreach (var token in recipientTokens)
        {
            try
            {
                await _notificationService.SendAsync(new NotificationMessage
                {
                    ShopId = shift.ShopId,
                    NotificationType = NotificationType.ShiftCloseSummary,
                    Channel = NotificationChannel.InApp,
                    Recipient = token,
                    Subject = subject,
                    Body = body,
                    RelatedEntityName = nameof(Shift),
                    RelatedEntityId = shift.Id
                }, cancellationToken);
            }
            catch
            {
                // Notification failures are logged by notification service and must not block shift close.
            }
        }

        _logger.LogInformation(
            "Shift close push attempted for shift {ShiftId} to {RecipientCount} recipient token(s).",
            shift.Id,
            recipientTokens.Length);
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

    private async Task<bool> IsSafeDropManagementEnabledAsync(Guid shopId, CancellationToken cancellationToken)
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

    private async Task SendManualEntryNotificationsAsync(
        Shift shift,
        BusinessDay businessDay,
        IReadOnlyCollection<ShiftScratchCardSale> entries,
        CancellationToken cancellationToken)
    {
        var flaggedEntries = entries.Where(x => x.NotificationRequired).ToArray();
        if (flaggedEntries.Length == 0)
        {
            return;
        }

        // Manual/edited-entry alert dispatch is a Growth+ feature. Starter shops still flag the
        // entries (IsFlaggedForReview is set above so they show up in reports), but no email is
        // sent.
        if (!await _featureGateService.HasFeatureAsync(shift.ShopId, FeatureKeys.ScratchCardManualEntryAlerts, cancellationToken))
        {
            return;
        }

        var recipients = await _shopUserRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shift.ShopId && x.IsActive && (x.Role.Name == "CompanyOwner" || x.Role.Name == "Manager"))
            .Include(x => x.Role)
            .Include(x => x.User)
            .Select(x => x.User.Email)
            .Distinct()
            .ToListAsync(cancellationToken);

        if (recipients.Count == 0)
        {
            return;
        }

        var shopName = await _shopRepository.Query()
            .AsNoTracking()
            .Where(x => x.Id == shift.ShopId)
            .Select(x => x.ShopName)
            .FirstOrDefaultAsync(cancellationToken) ?? "Unknown Shop";

        var body = BuildManualNotificationBody(shopName, shift, businessDay, flaggedEntries);
        var anySent = false;

        foreach (var recipient in recipients)
        {
            try
            {
                await _notificationService.SendAsync(new NotificationMessage
                {
                    ShopId = shift.ShopId,
                    NotificationType = NotificationType.ManualClosingSerialEntry,
                    Channel = NotificationChannel.Email,
                    Recipient = recipient,
                    Subject = $"Manual or Edited Closing Serial Entries - {shift.ShiftName}",
                    Body = body,
                    RelatedEntityName = nameof(Shift),
                    RelatedEntityId = shift.Id
                }, cancellationToken);
                anySent = true;
            }
            catch
            {
                // Notification failures are logged by notification service and must not block shift close.
            }
        }

        if (!anySent)
        {
            return;
        }

        try
        {
            var flaggedEntryIds = flaggedEntries.Select(x => x.Id).Distinct().ToArray();
            if (flaggedEntryIds.Length == 0)
            {
                return;
            }

            var notificationSentOn = DateTimeOffset.UtcNow;
            await _salesRepository.Query()
                .Where(x => flaggedEntryIds.Contains(x.Id))
                .ExecuteUpdateAsync(
                    setters => setters
                        .SetProperty(x => x.NotificationSent, true)
                        .SetProperty(x => x.NotificationSentOn, notificationSentOn),
                    cancellationToken);
        }
        catch
        {
            // Persisting notification metadata must not block shift close.
        }
    }

    private static string BuildManualNotificationBody(
        string shopName,
        Shift shift,
        BusinessDay businessDay,
        IEnumerable<ShiftScratchCardSale> entries)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"Shop: {shopName}");
        sb.AppendLine($"Business Date: {businessDay.BusinessDate:yyyy-MM-dd}");
        sb.AppendLine($"Shift: {shift.ShiftName}");
        sb.AppendLine($"Closed Time: {(shift.ClosedOn ?? shift.EndTime):O}");
        sb.AppendLine();

        foreach (var entry in entries.Where(x => x.NotificationRequired))
        {
            var packNumber = entry.Pack?.PackNumber ?? "Unknown";
            var gameName = entry.Pack?.Game?.GameName ?? "Unknown";
            sb.AppendLine($"Pack: {packNumber} | Game: {gameName}");
            sb.AppendLine($"Opening Serial: {entry.OpeningSerialNumber}");
            sb.AppendLine($"Original Scanned Serial: {entry.OriginalScannedSerialNumber ?? "N/A"}");
            sb.AppendLine($"Final Closing Serial: {entry.ClosingSerialNumber}");
            sb.AppendLine($"Entry Method: {entry.EntryMethod}");
            sb.AppendLine($"Sold Quantity: {entry.SoldQuantity}");
            sb.AppendLine($"Sales Amount: {entry.SalesAmount:C}");
            sb.AppendLine($"Reason: {(string.IsNullOrWhiteSpace(entry.ManualEntryReason) ? "No reason provided" : entry.ManualEntryReason)}");
            sb.AppendLine(new string('-', 40));
        }

        return sb.ToString();
    }

    private sealed record ShiftCloseSummaryRow(
        int? DisplayNumber,
        string GameName,
        decimal TicketPrice,
        int SoldQuantity,
        decimal SalesAmount);

    private sealed record SafeDropSummaryRow(
        string CanisterNumber,
        decimal Amount,
        string DroppedByName,
        DateTimeOffset DroppedOn);

    // Latest temperature reading snapshot per active monitoring unit on the shift's business
    // day. Included in shift- and day-close reports so managers can see fridge / freezer
    // checks alongside sales.
    private sealed record TemperatureSummaryRow(
        string UnitName,
        string EquipmentType,
        string? Location,
        decimal MinTemperatureCelsius,
        decimal MaxTemperatureCelsius,
        decimal? LatestTemperatureCelsius,
        TimeOnly? LatestReadingTime,
        bool? IsOutOfRange);

    // One row per active monitoring unit, with the latest reading recorded on the supplied
    // business date (or no reading if nothing was logged yet). Used by both shift- and day-
    // close summary reports.
    private async Task<TemperatureSummaryRow[]> LoadTemperatureSummaryRowsAsync(
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
    private static string BuildShiftReportFileSuffix(Shift shift, BusinessDay businessDay)
    {
        var shiftSegment = ReportPdfBuilder.SanitizeFileNameSegment(shift.ShiftName);
        if (string.IsNullOrWhiteSpace(shiftSegment))
        {
            shiftSegment = "shift";
        }

        return $"{businessDay.BusinessDate:yyyyMMdd}-{shiftSegment}";
    }

    private static byte[] BuildScratchCardSectionPdf(
        IReadOnlyList<KeyValuePair<string, string>> metaRows,
        IReadOnlyCollection<ShiftCloseSummaryRow> rows)
    {
        var columns = new[]
        {
            new ReportPdfBuilder.Column("Display", 90f),
            new ReportPdfBuilder.Column("Game Name", 230f),
            new ReportPdfBuilder.Column("Price", 90f, AlignRight: true),
            new ReportPdfBuilder.Column("Qty", 80f, AlignRight: true),
            new ReportPdfBuilder.Column("Sales", 110f, AlignRight: true),
        };
        var tableRows = rows
            .Select(row => (IReadOnlyList<string>)new[]
            {
                row.DisplayNumber?.ToString(CultureInfo.InvariantCulture) ?? "-",
                row.GameName,
                row.TicketPrice.ToString("0.00", CultureInfo.InvariantCulture),
                row.SoldQuantity.ToString(CultureInfo.InvariantCulture),
                row.SalesAmount.ToString("0.00", CultureInfo.InvariantCulture),
            })
            .ToArray();
        var totalQty = rows.Sum(x => x.SoldQuantity);
        var totalSales = rows.Sum(x => x.SalesAmount);
        var footer = $"Total Qty: {totalQty.ToString(CultureInfo.InvariantCulture)}   Total Sales: £{totalSales.ToString("0.00", CultureInfo.InvariantCulture)}";

        return ReportPdfBuilder.BuildTableReport(
            "Scratch Card Sales",
            metaRows,
            columns,
            tableRows,
            footer,
            "No shift entries.");
    }

    private static byte[] BuildTemperatureSectionPdf(
        IReadOnlyList<KeyValuePair<string, string>> metaRows,
        IReadOnlyCollection<TemperatureSummaryRow> rows)
    {
        var columns = new[]
        {
            new ReportPdfBuilder.Column("Unit", 200f),
            new ReportPdfBuilder.Column("Equipment", 150f),
            new ReportPdfBuilder.Column("Range", 120f),
            new ReportPdfBuilder.Column("Latest Reading", 160f),
            new ReportPdfBuilder.Column("Status", 110f),
        };
        var tableRows = rows
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
        var outOfRange = rows.Count(r => r.IsOutOfRange == true);
        var pending = rows.Count(r => r.LatestTemperatureCelsius is null);
        var footer = $"Units: {rows.Count.ToString(CultureInfo.InvariantCulture)}   Out of range: {outOfRange.ToString(CultureInfo.InvariantCulture)}   Pending: {pending.ToString(CultureInfo.InvariantCulture)}";

        return ReportPdfBuilder.BuildTableReport(
            "Temperature Log",
            metaRows,
            columns,
            tableRows,
            footer,
            "No monitoring units.");
    }

    private static byte[] BuildSafeDropSectionPdf(
        IReadOnlyList<KeyValuePair<string, string>> metaRows,
        IReadOnlyCollection<SafeDropSummaryRow> rows)
    {
        var columns = new[]
        {
            new ReportPdfBuilder.Column("Canister", 150f),
            new ReportPdfBuilder.Column("Amount", 110f, AlignRight: true),
            new ReportPdfBuilder.Column("Dropped By", 280f),
            new ReportPdfBuilder.Column("Dropped On (UTC)", 200f),
        };
        var tableRows = rows
            .Select(row => (IReadOnlyList<string>)new[]
            {
                string.IsNullOrWhiteSpace(row.CanisterNumber) ? "-" : row.CanisterNumber,
                row.Amount.ToString("0.00", CultureInfo.InvariantCulture),
                string.IsNullOrWhiteSpace(row.DroppedByName) ? "-" : row.DroppedByName,
                row.DroppedOn.ToUniversalTime().ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture),
            })
            .ToArray();
        var total = rows.Sum(x => x.Amount);
        var footer = $"Total: £{total.ToString("0.00", CultureInfo.InvariantCulture)}   Entries: {rows.Count.ToString(CultureInfo.InvariantCulture)}";

        return ReportPdfBuilder.BuildTableReport(
            "Safe Drop Detail",
            metaRows,
            columns,
            tableRows,
            footer,
            "No safe drops recorded for this shift.");
    }

    private static ShiftCloseSummaryRow[] BuildShiftCloseSummaryRows(
        IReadOnlyCollection<ShiftScratchCardSale> entries,
        IReadOnlyDictionary<Guid, ScratchCardPack> packs)
    {
        return entries
            .Select(entry =>
            {
                packs.TryGetValue(entry.PackId, out var pack);
                return new ShiftCloseSummaryRow(
                    pack?.DisplayNumber,
                    pack?.Game?.GameName ?? "Unknown",
                    entry.TicketPrice,
                    entry.SoldQuantity,
                    entry.SalesAmount);
            })
            .OrderBy(x => x.DisplayNumber ?? int.MaxValue)
            .ThenBy(x => x.GameName, StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    private static string BuildShiftCloseSummaryBodyHtml(
        string shopName,
        Shift shift,
        BusinessDay businessDay,
        IReadOnlyCollection<ShiftCloseSummaryRow> rows,
        IReadOnlyCollection<SafeDropSummaryRow> safeDropRows,
        bool safeDropManagementEnabled,
        IReadOnlyCollection<TemperatureSummaryRow> temperatureRows,
        DateTimeOffset reportGeneratedOnUtc)
    {
        var reportDateText = reportGeneratedOnUtc.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture);
        var shiftDetail = $"{shift.ShiftName} ({businessDay.BusinessDate:yyyy-MM-dd})";
        var totalSoldQty = rows.Sum(x => x.SoldQuantity);
        var totalSales = rows.Sum(x => x.SalesAmount);

        var detailRowsHtml = rows.Count == 0
            ? "<tr><td colspan=\"5\" class=\"empty\">No shift entries.</td></tr>"
            : string.Join(
                string.Empty,
                rows.Select(row =>
                {
                    var display = row.DisplayNumber?.ToString(CultureInfo.InvariantCulture) ?? "-";
                    return
                        "<tr>" +
                        $"<td>{WebUtility.HtmlEncode(display)}</td>" +
                        $"<td>{WebUtility.HtmlEncode(row.GameName)}</td>" +
                        $"<td class=\"num\">{row.TicketPrice.ToString("0.00", CultureInfo.InvariantCulture)}</td>" +
                        $"<td class=\"num\">{row.SoldQuantity.ToString(CultureInfo.InvariantCulture)}</td>" +
                        $"<td class=\"num\">{row.SalesAmount.ToString("0.00", CultureInfo.InvariantCulture)}</td>" +
                        "</tr>";
                }));

        var safeDropTotalAmount = safeDropRows.Sum(x => x.Amount);
        var safeDropRowsHtml = safeDropRows.Count == 0
            ? "<tr><td colspan=\"4\" class=\"empty\">No safe drops recorded for this shift.</td></tr>"
            : string.Join(
                string.Empty,
                safeDropRows.Select(row =>
                {
                    var droppedByName = string.IsNullOrWhiteSpace(row.DroppedByName) ? "-" : row.DroppedByName;
                    var droppedOnUtc = row.DroppedOn.ToUniversalTime().ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture);
                    return
                        "<tr>" +
                        $"<td>{WebUtility.HtmlEncode(string.IsNullOrWhiteSpace(row.CanisterNumber) ? "-" : row.CanisterNumber)}</td>" +
                        $"<td class=\"num\">{row.Amount.ToString("0.00", CultureInfo.InvariantCulture)}</td>" +
                        $"<td>{WebUtility.HtmlEncode(droppedByName)}</td>" +
                        $"<td>{WebUtility.HtmlEncode(droppedOnUtc)} UTC</td>" +
                        "</tr>";
                }));

    var sb = new StringBuilder();

sb.Append("<!DOCTYPE html>");
sb.Append("<html>");
sb.Append("<head>");
sb.Append("<meta charset=\"UTF-8\" />");
sb.Append("<style>");

sb.Append("*{box-sizing:border-box;}");
sb.Append("body{font-family:Arial,Helvetica,sans-serif;background:#eef3f8;color:#172536;margin:0;padding:24px;}");
sb.Append(".shell{max-width:1120px;margin:0 auto;background:#ffffff;border:1px solid #d7e1ec;border-radius:18px;overflow:hidden;box-shadow:0 12px 32px rgba(20,43,68,.10);}");

sb.Append(".hero{padding:24px 28px;background:linear-gradient(135deg,#123f68,#0b7890);color:#ffffff;}");
sb.Append(".hero-top{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;}");
sb.Append(".hero h2{margin:0;font-size:24px;line-height:30px;font-weight:700;letter-spacing:.2px;}");
sb.Append(".hero p{margin:7px 0 0 0;font-size:13px;opacity:.92;}");
sb.Append(".report-badge{display:inline-block;white-space:nowrap;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.30);padding:7px 11px;border-radius:999px;font-size:12px;font-weight:700;letter-spacing:.3px;text-transform:uppercase;}");

sb.Append(".content{padding:24px 28px 28px 28px;}");
sb.Append(".section{margin-bottom:20px;}");
sb.Append(".section-header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px;}");
sb.Append(".section-title{font-size:15px;font-weight:700;color:#173a59;margin:0;}");

sb.Append(".status-pill{display:inline-block;padding:6px 10px;border-radius:999px;background:#e8f8f3;color:#06795f;border:1px solid #bfeadd;font-size:12px;font-weight:700;}");

sb.Append(".meta{width:100%;border-collapse:separate;border-spacing:0;font-size:13px;border:1px solid #d7e1ec;border-radius:12px;overflow:hidden;}");
sb.Append(".meta td{padding:10px 12px;border-bottom:1px solid #d7e1ec;}");
sb.Append(".meta tr:last-child td{border-bottom:none;}");
sb.Append(".meta td:first-child{background:#f2f6fb;font-weight:700;width:200px;color:#294864;}");
sb.Append(".meta td:last-child{background:#ffffff;color:#182c3f;}");

sb.Append(".report-table{width:100%;border-collapse:separate;border-spacing:0;margin-bottom:20px;font-size:13px;border:1px solid #d7e1ec;border-radius:12px;overflow:hidden;}");
sb.Append(".report-table th,.report-table td{padding:10px 12px;border-bottom:1px solid #d7e1ec;}");
sb.Append(".report-table th{background:#f0f6fd;color:#1c3d5b;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:.35px;}");
sb.Append(".report-table td{background:#ffffff;color:#1d2f41;}");
sb.Append(".report-table tbody tr:nth-child(even) td{background:#fafcff;}");
sb.Append(".report-table tbody tr:last-child td{border-bottom:none;}");
sb.Append(".report-table td.num,.report-table th.num{text-align:right;font-variant-numeric:tabular-nums;}");
sb.Append(".report-table td.empty{text-align:center;color:#607a93;background:#f8fbff;}");
sb.Append(".report-table tfoot td{background:#edf6ff;font-weight:800;color:#10263a;border-top:1px solid #c8d9eb;border-bottom:none;}");

sb.Append(".footer{padding-top:4px;font-size:11px;color:#788da0;text-align:right;}");
sb.Append("@media(max-width:800px){body{padding:12px;}.hero,.content{padding:18px;}.hero-top{display:block;}.report-badge{margin-top:12px;}.meta td:first-child{width:150px;}}");
sb.Append("@media(max-width:520px){.report-table{font-size:12px;}.report-table th,.report-table td{padding:8px;}}");

sb.Append("</style>");
sb.Append("</head>");
sb.Append("<body>");

sb.Append("<div class=\"shell\">");

sb.Append("<div class=\"hero\">");
sb.Append("<div class=\"hero-top\">");
sb.Append("<div>");
sb.Append("<h2>Scratch Card Shift Close Report</h2>");
sb.Append("<p>Shift sales summary and display-level scratch card closing details</p>");
sb.Append("</div>");
sb.Append("<div class=\"report-badge\">Shift Closed</div>");
sb.Append("</div>");
sb.Append("</div>");

sb.Append("<div class=\"content\">");

sb.Append("<div class=\"section\">");
sb.Append("<div class=\"section-header\">");
sb.Append("<h3 class=\"section-title\">Report Details</h3>");

sb.Append("</div>");

sb.Append("<table class=\"meta\">");
sb.Append("<tbody>");
sb.Append($"<tr><td>Shop Name</td><td>{WebUtility.HtmlEncode(shopName)}</td></tr>");
sb.Append($"<tr><td>Shift Detail</td><td>{WebUtility.HtmlEncode(shiftDetail)}</td></tr>");
sb.Append($"<tr><td>Report Date</td><td>{WebUtility.HtmlEncode(reportDateText)} UTC</td></tr>");
sb.Append("</tbody>");
sb.Append("</table>");
sb.Append("</div>");

sb.Append("<div class=\"section-header\">");
sb.Append("<h3 class=\"section-title\">Sales Detail</h3>");
sb.Append("</div>");

sb.Append("<table class=\"report-table\">");
sb.Append("<thead>");
sb.Append("<tr>");
sb.Append("<th>Display Number</th>");
sb.Append("<th>Game Name</th>");
sb.Append("<th class=\"num\">Price</th>");
sb.Append("<th class=\"num\">Qty</th>");
sb.Append("<th class=\"num\">Sales</th>");
sb.Append("</tr>");
sb.Append("</thead>");

sb.Append("<tbody>");
sb.Append(detailRowsHtml);
sb.Append("</tbody>");

sb.Append("<tfoot>");
sb.Append("<tr>");
sb.Append("<td colspan=\"3\" class=\"num\">Total</td>");
sb.Append($"<td class=\"num\">{totalSoldQty.ToString(CultureInfo.InvariantCulture)}</td>");
sb.Append($"<td class=\"num\">£{totalSales.ToString("0.00", CultureInfo.InvariantCulture)}</td>");
sb.Append("</tr>");
sb.Append("</tfoot>");

sb.Append("</table>");

if (safeDropManagementEnabled)
{
    sb.Append("<div class=\"section-header\">");
    sb.Append("<h3 class=\"section-title\">Safe Drop Detail</h3>");
    sb.Append("</div>");

    sb.Append("<table class=\"report-table\">");
    sb.Append("<thead>");
    sb.Append("<tr>");
    sb.Append("<th>Canister</th>");
    sb.Append("<th class=\"num\">Amount</th>");
    sb.Append("<th>Dropped By</th>");
    sb.Append("<th>Dropped On (UTC)</th>");
    sb.Append("</tr>");
    sb.Append("</thead>");
    sb.Append("<tbody>");
    sb.Append(safeDropRowsHtml);
    sb.Append("</tbody>");
    sb.Append("<tfoot>");
    sb.Append("<tr>");
    sb.Append("<td class=\"num\">Total</td>");
    sb.Append($"<td class=\"num\">{safeDropTotalAmount.ToString("0.00", CultureInfo.InvariantCulture)}</td>");
    sb.Append($"<td colspan=\"2\">Entries: {safeDropRows.Count.ToString(CultureInfo.InvariantCulture)}</td>");
    sb.Append("</tr>");
    sb.Append("</tfoot>");
    sb.Append("</table>");
}

if (temperatureRows.Count > 0)
{
    var temperatureOutOfRangeCount = temperatureRows.Count(r => r.IsOutOfRange == true);
    var temperaturePendingCount = temperatureRows.Count(r => r.LatestTemperatureCelsius is null);

    sb.Append("<div class=\"section-header\">");
    sb.Append("<h3 class=\"section-title\">Temperature Log</h3>");
    sb.Append("</div>");

    sb.Append("<table class=\"report-table\">");
    sb.Append("<thead>");
    sb.Append("<tr>");
    sb.Append("<th>Unit</th>");
    sb.Append("<th>Equipment</th>");
    sb.Append("<th>Range</th>");
    sb.Append("<th>Latest Reading</th>");
    sb.Append("<th>Status</th>");
    sb.Append("</tr>");
    sb.Append("</thead>");
    sb.Append("<tbody>");
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
    sb.Append("</tbody>");
    sb.Append("<tfoot>");
    sb.Append("<tr>");
    sb.Append($"<td colspan=\"5\">Units: {temperatureRows.Count.ToString(CultureInfo.InvariantCulture)} · Out of range: {temperatureOutOfRangeCount.ToString(CultureInfo.InvariantCulture)} · Pending: {temperaturePendingCount.ToString(CultureInfo.InvariantCulture)}</td>");
    sb.Append("</tr>");
    sb.Append("</tfoot>");
    sb.Append("</table>");
}

sb.Append("<div class=\"footer\">Generated by Ops Arrow</div>");

sb.Append("</div>");
sb.Append("</div>");

sb.Append("</body>");
sb.Append("</html>");       return sb.ToString();
    }

}
