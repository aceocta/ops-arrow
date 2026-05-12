using System.Text;
using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Models;
using ScratchCard.Application.Common.Services;
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
    private readonly IRepository<ShiftScratchCardSale> _salesRepository;
    private readonly IRepository<PrizePayout> _payoutRepository;
    private readonly IRepository<ShiftReconciliation> _reconciliationRepository;
    private readonly IRepository<ShopUser> _shopUserRepository;
    private readonly IRepository<Shop> _shopRepository;
    private readonly IShopConfigurationService _shopConfigurationService;
    private readonly ISerialCalculationService _serialCalculationService;
    private readonly INotificationService _notificationService;
    private readonly IAuditService _auditService;
    private readonly ICurrentUserService _currentUserService;
    private readonly IUnitOfWork _unitOfWork;

    public ShiftSalesService(
        IRepository<Shift> shiftRepository,
        IRepository<BusinessDay> businessDayRepository,
        IRepository<ScratchCardPack> packRepository,
        IRepository<ShiftScratchCardSale> salesRepository,
        IRepository<PrizePayout> payoutRepository,
        IRepository<ShiftReconciliation> reconciliationRepository,
        IRepository<ShopUser> shopUserRepository,
        IRepository<Shop> shopRepository,
        IShopConfigurationService shopConfigurationService,
        ISerialCalculationService serialCalculationService,
        INotificationService notificationService,
        IAuditService auditService,
        ICurrentUserService currentUserService,
        IUnitOfWork unitOfWork)
    {
        _shiftRepository = shiftRepository;
        _businessDayRepository = businessDayRepository;
        _packRepository = packRepository;
        _salesRepository = salesRepository;
        _payoutRepository = payoutRepository;
        _reconciliationRepository = reconciliationRepository;
        _shopUserRepository = shopUserRepository;
        _shopRepository = shopRepository;
        _shopConfigurationService = shopConfigurationService;
        _serialCalculationService = serialCalculationService;
        _notificationService = notificationService;
        _auditService = auditService;
        _currentUserService = currentUserService;
        _unitOfWork = unitOfWork;
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
            .Include(x => x.Pack)
            .ToListAsync(cancellationToken);

        return entries.Select(x => x.ToDto()).ToArray();
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

        var packIds = request.Entries.Select(x => x.PackId).Distinct().ToArray();
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

        var existingSales = await _salesRepository.Query()
            .Where(x => x.ShiftId == shift.Id)
            .ToListAsync(cancellationToken);

        foreach (var sale in existingSales)
        {
            _salesRepository.Remove(sale);
        }

        var salesEntries = new List<ShiftScratchCardSale>();
        foreach (var entry in request.Entries)
        {
            if (!packs.TryGetValue(entry.PackId, out var pack))
            {
                throw new AppException(ErrorCodes.PackNotFound, "Referenced pack was not found.");
            }

            var calc = _serialCalculationService.Calculate(
                pack.CurrentSerialNumber,
                entry.ClosingSerialNumber,
                pack.StartSerialNumber,
                pack.EndSerialNumber,
                packSetup.SellingOrder,
                pack.TicketPrice,
                pack.TotalTickets);

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
                OpeningSerialNumber = pack.CurrentSerialNumber,
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

        await _salesRepository.AddRangeAsync(salesEntries, cancellationToken);

        var totalSales = salesEntries.Sum(x => x.SalesAmount);
        var totalPrizePayout = await _payoutRepository.Query()
            .Where(x => x.ShiftId == shift.Id)
            .SumAsync(x => x.PrizeAmount, cancellationToken);

        var expectedCash = totalSales - totalPrizePayout;
        var difference = request.ActualCash - expectedCash;

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
        reconciliation.ActualCash = request.ActualCash;
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

        shift.Status = ShiftStatus.Closed;
        shift.SyncStatus = SyncStatus.Synced;
        shift.EndTime = DateTimeOffset.UtcNow;
        shift.ClosedByUserId = _currentUserService.UserId;
        shift.ModifiedOn = DateTimeOffset.UtcNow;
        shift.ModifiedBy = _currentUserService.UserId;
        _shiftRepository.Update(shift);

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        var hasFlags = salesEntries.Any(x => x.NotificationRequired);
        if (hasFlags)
        {
            await SendManualEntryNotificationsAsync(shift, businessDay, salesEntries, cancellationToken);
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
            ActualCash = request.ActualCash,
            Difference = difference,
            HasManualOrEditedEntries = hasFlags
        };
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

        var recipients = await _shopUserRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shift.ShopId && x.IsActive && (x.Role.Name == "ShopOwner" || x.Role.Name == "Manager"))
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
            var notificationSentOn = DateTimeOffset.UtcNow;
            foreach (var entry in flaggedEntries)
            {
                entry.NotificationSent = true;
                entry.NotificationSentOn = notificationSentOn;
                _salesRepository.Update(entry);
            }

            await _unitOfWork.SaveChangesAsync(cancellationToken);
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
        sb.AppendLine($"Closed Time: {shift.EndTime:O}");
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
}

