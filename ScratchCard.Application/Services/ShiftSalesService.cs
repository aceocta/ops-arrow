using System.Text;
using System.Globalization;
using System.Net;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
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
    private readonly IRepository<ShiftOpeningSerial> _shiftOpeningSerialRepository;
    private readonly IRepository<ShiftScratchCardSale> _salesRepository;
    private readonly IRepository<PrizePayout> _payoutRepository;
    private readonly IRepository<ShiftReconciliation> _reconciliationRepository;
    private readonly IRepository<ShiftCloseAttachment> _shiftCloseAttachmentRepository;
    private readonly IRepository<ShopUser> _shopUserRepository;
    private readonly IRepository<Shop> _shopRepository;
    private readonly IShopConfigurationService _shopConfigurationService;
    private readonly ISerialCalculationService _serialCalculationService;
    private readonly INotificationService _notificationService;
    private readonly IShiftCloseNotificationDispatcher _shiftCloseNotificationDispatcher;
    private readonly IAuditService _auditService;
    private readonly ICurrentUserService _currentUserService;
    private readonly IAttachmentStorageService _attachmentStorageService;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ILogger<ShiftSalesService> _logger;

    public ShiftSalesService(
        IRepository<Shift> shiftRepository,
        IRepository<BusinessDay> businessDayRepository,
        IRepository<ScratchCardPack> packRepository,
        IRepository<ShiftOpeningSerial> shiftOpeningSerialRepository,
        IRepository<ShiftScratchCardSale> salesRepository,
        IRepository<PrizePayout> payoutRepository,
        IRepository<ShiftReconciliation> reconciliationRepository,
        IRepository<ShiftCloseAttachment> shiftCloseAttachmentRepository,
        IRepository<ShopUser> shopUserRepository,
        IRepository<Shop> shopRepository,
        IShopConfigurationService shopConfigurationService,
        ISerialCalculationService serialCalculationService,
        INotificationService notificationService,
        IShiftCloseNotificationDispatcher shiftCloseNotificationDispatcher,
        IAuditService auditService,
        ICurrentUserService currentUserService,
        IAttachmentStorageService attachmentStorageService,
        IUnitOfWork unitOfWork,
        ILogger<ShiftSalesService> logger)
    {
        _shiftRepository = shiftRepository;
        _businessDayRepository = businessDayRepository;
        _packRepository = packRepository;
        _shiftOpeningSerialRepository = shiftOpeningSerialRepository;
        _salesRepository = salesRepository;
        _payoutRepository = payoutRepository;
        _reconciliationRepository = reconciliationRepository;
        _shiftCloseAttachmentRepository = shiftCloseAttachmentRepository;
        _shopUserRepository = shopUserRepository;
        _shopRepository = shopRepository;
        _shopConfigurationService = shopConfigurationService;
        _serialCalculationService = serialCalculationService;
        _notificationService = notificationService;
        _shiftCloseNotificationDispatcher = shiftCloseNotificationDispatcher;
        _auditService = auditService;
        _currentUserService = currentUserService;
        _attachmentStorageService = attachmentStorageService;
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

        await SendShiftCloseSummaryToOwnersAsync(shift, businessDay, entries, packs, cancellationToken);
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
        foreach (var entry in request.Entries)
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
        shift.EndTime = DateTimeOffset.UtcNow;
        shift.ClosedByUserId = _currentUserService.UserId;
        shift.ModifiedOn = DateTimeOffset.UtcNow;
        shift.ModifiedBy = _currentUserService.UserId;
        _shiftRepository.Update(shift);

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        var hasFlags = salesEntries.Any(x => x.NotificationRequired);
        try
        {
            using var enqueueTimeout = new CancellationTokenSource(TimeSpan.FromMilliseconds(250));
            await _shiftCloseNotificationDispatcher.EnqueueAsync(
                new ShiftCloseNotificationWorkItem
                {
                    ShiftId = shift.Id,
                    IncludeManualEntryNotifications = false
                },
                enqueueTimeout.Token);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to enqueue shift close notifications for shift {ShiftId}", shift.Id);
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
            HasManualOrEditedEntries = hasFlags
        };
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

        var summaryRows = BuildShiftCloseSummaryRows(entries, packs);
        var reportGeneratedOnUtc = DateTimeOffset.UtcNow;
        var subject = $"Shift Close Summary - {shopName} - {businessDay.BusinessDate:yyyy-MM-dd} - {shift.ShiftName}";
        var body = BuildShiftCloseSummaryBodyHtml(shopName, shift, businessDay, summaryRows, reportGeneratedOnUtc);
        var summaryPdf = BuildShiftCloseSummaryPdf(shopName, shift, businessDay, summaryRows, reportGeneratedOnUtc);
        var summaryPdfFileName = BuildShiftCloseSummaryPdfFileName(shift, businessDay);
        var attachments = new EmailAttachment[]
        {
            new()
            {
                FileName = summaryPdfFileName,
                ContentType = "application/pdf",
                Content = summaryPdf
            }
        };

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

    private async Task<List<string>> ResolveSummaryRecipientsAsync(Guid shopId, CancellationToken cancellationToken)
    {
        var recipients = await _shopUserRepository.Query()
            .AsNoTracking()
            .Where(x =>
                x.ShopId == shopId &&
                x.IsActive &&
                !string.IsNullOrWhiteSpace(x.User.Email) &&
                (x.Role.Name == RoleNames.ShopOwner || x.Role.Name == RoleNames.Manager))
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

    private sealed record ShiftCloseSummaryRow(
        int? DisplayNumber,
        string GameName,
        decimal TicketPrice,
        int SoldQuantity,
        decimal SalesAmount);

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

sb.Append("<div class=\"footer\">Generated by Ops Arrow</div>");

sb.Append("</div>");
sb.Append("</div>");

sb.Append("</body>");
sb.Append("</html>");       return sb.ToString();
    }

    private static byte[] BuildShiftCloseSummaryPdf(
        string shopName,
        Shift shift,
        BusinessDay businessDay,
        IReadOnlyCollection<ShiftCloseSummaryRow> rows,
        DateTimeOffset reportGeneratedOnUtc)
    {
        const float pageWidth = 842f;
        const float pageHeight = 595f;
        const float margin = 36f;
        const float contentWidth = pageWidth - (margin * 2f);

        var labelColumnWidth = 220f;
        var valueColumnWidth = contentWidth - labelColumnWidth;
        var displayColumnWidth = 140f;
        var gameColumnWidth = 250f;
        var priceColumnWidth = 90f;
        var qtyColumnWidth = 74f;

        var headerFill = new PdfColor(0.80f, 0.84f, 0.90f);
        var totalFill = new PdfColor(0.80f, 0.84f, 0.90f);
        var cardFill = new PdfColor(0.85f, 0.88f, 0.93f);
        var cellFill = new PdfColor(1f, 1f, 1f);
        var stripeFill = new PdfColor(0.96f, 0.97f, 0.99f);
        var borderColor = new PdfColor(0.77f, 0.81f, 0.87f);
        var textColor = new PdfColor(0.12f, 0.20f, 0.30f);
        var subtleTextColor = new PdfColor(0.33f, 0.44f, 0.56f);

        var totalSoldQty = rows.Sum(x => x.SoldQuantity);
        var totalSales = rows.Sum(x => x.SalesAmount);
        var reportDateText = reportGeneratedOnUtc.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture);
        var shiftDetail = $"{shift.ShiftName} ({businessDay.BusinessDate:yyyy-MM-dd})";

        var pages = new List<StringBuilder>();
        var currentPage = NewPage();
        var cursorY = margin;

        DrawInfoRow("Shop Name", shopName);
        DrawInfoRow("Shift Detail", shiftDetail);
        DrawInfoRow("Report Date", $"{reportDateText} UTC");
        cursorY += 24f;

        var cardHeight = 78f;
        var cardWidth = 160f;
        var cardGap = 10f;
        EnsureSpace(cardHeight + 28f);
        DrawRect(currentPage, pageHeight, margin, cursorY, cardWidth, cardHeight, cardFill, borderColor);
        DrawRect(currentPage, pageHeight, margin + cardWidth + cardGap, cursorY, cardWidth, cardHeight, cardFill, borderColor);

        DrawText(currentPage, pageHeight, "F1", 20f, subtleTextColor, margin + 16f, cursorY + 30f, "TOTAL QTY");
        DrawText(currentPage, pageHeight, "F2", 28f, textColor, margin + 16f, cursorY + 60f, totalSoldQty.ToString(CultureInfo.InvariantCulture));

        DrawText(currentPage, pageHeight, "F1", 20f, subtleTextColor, margin + cardWidth + cardGap + 16f, cursorY + 30f, "TOTAL SALES");
        DrawText(currentPage, pageHeight, "F2", 28f, textColor, margin + cardWidth + cardGap + 16f, cursorY + 60f, totalSales.ToString("0.00", CultureInfo.InvariantCulture));
        cursorY += cardHeight + 26f;

        EnsureSpace(30f);
        DrawText(currentPage, pageHeight, "F2", 24f, textColor, margin, cursorY + 22f, "Sales Detail");
        cursorY += 34f;

        DrawTableHeader();

        if (rows.Count == 0)
        {
            var rowHeight = 34f;
            EnsureSpace(rowHeight + 34f);
            DrawRowBackground(cursorY, rowHeight, cellFill);
            DrawCellText("No shift entries.", margin + displayColumnWidth + 8f, cursorY + 22f, "F1", 14f, textColor, false);
            DrawRowBorders(cursorY, rowHeight);
            cursorY += rowHeight;
        }
        else
        {
            var rowIndex = 0;
            foreach (var row in rows)
            {
                var displayText = row.DisplayNumber?.ToString(CultureInfo.InvariantCulture) ?? "-";
                var gameTextLines = WrapTextForPdf(row.GameName, gameColumnWidth - 16f, 14f);
                var rowHeight = Math.Max(34f, 14f + (gameTextLines.Length * 18f));

                EnsureSpace(rowHeight + 34f);
                DrawRowBackground(cursorY, rowHeight, rowIndex % 2 == 0 ? cellFill : stripeFill);
                DrawCellText(displayText, margin + 8f, cursorY + 22f, "F1", 14f, textColor, false);

                for (var i = 0; i < gameTextLines.Length; i++)
                {
                    DrawCellText(gameTextLines[i], margin + displayColumnWidth + 8f, cursorY + 22f + (i * 18f), "F1", 14f, textColor, false);
                }

                DrawCellText(row.TicketPrice.ToString("0.00", CultureInfo.InvariantCulture), margin + displayColumnWidth + gameColumnWidth + priceColumnWidth - 8f, cursorY + 22f, "F1", 14f, textColor, true);
                DrawCellText(row.SoldQuantity.ToString(CultureInfo.InvariantCulture), margin + displayColumnWidth + gameColumnWidth + priceColumnWidth + qtyColumnWidth - 8f, cursorY + 22f, "F1", 14f, textColor, true);
                DrawCellText(row.SalesAmount.ToString("0.00", CultureInfo.InvariantCulture), margin + contentWidth - 8f, cursorY + 22f, "F1", 14f, textColor, true);
                DrawRowBorders(cursorY, rowHeight);
                cursorY += rowHeight;
                rowIndex++;
            }
        }

        var totalRowHeight = 38f;
        EnsureSpace(totalRowHeight);
        DrawRowBackground(cursorY, totalRowHeight, totalFill);
        DrawCellText("Total", margin + displayColumnWidth + gameColumnWidth + priceColumnWidth - 8f, cursorY + 24f, "F2", 18f, textColor, true);
        DrawCellText(totalSoldQty.ToString(CultureInfo.InvariantCulture), margin + displayColumnWidth + gameColumnWidth + priceColumnWidth + qtyColumnWidth - 8f, cursorY + 24f, "F2", 18f, textColor, true);
        DrawCellText(totalSales.ToString("0.00", CultureInfo.InvariantCulture), margin + contentWidth - 8f, cursorY + 24f, "F2", 18f, textColor, true);
        DrawRowBorders(cursorY, totalRowHeight);

        return BuildPdfFromPageContents(
            pages.Select(page => page.ToString()),
            pageWidth,
            pageHeight,
            includeBoldFont: true);

        void DrawInfoRow(string label, string value)
        {
            const float rowHeight = 42f;
            EnsureSpace(rowHeight);
            DrawRect(currentPage, pageHeight, margin, cursorY, labelColumnWidth, rowHeight, cellFill, borderColor);
            DrawRect(currentPage, pageHeight, margin + labelColumnWidth, cursorY, valueColumnWidth, rowHeight, cellFill, borderColor);
            DrawCellText(label, margin + 14f, cursorY + 27f, "F1", 22f, textColor, false);
            DrawCellText(value, margin + labelColumnWidth + 14f, cursorY + 27f, "F1", 22f, textColor, false);
            cursorY += rowHeight;
        }

        void DrawTableHeader()
        {
            const float headerHeight = 42f;
            EnsureSpace(headerHeight + 38f);
            DrawRowBackground(cursorY, headerHeight, headerFill);
            DrawCellText("Display Number", margin + 8f, cursorY + 26f, "F2", 18f, textColor, false);
            DrawCellText("Game Name", margin + displayColumnWidth + 8f, cursorY + 26f, "F2", 18f, textColor, false);
            DrawCellText("Price", margin + displayColumnWidth + gameColumnWidth + 8f, cursorY + 26f, "F2", 18f, textColor, false);
            DrawCellText("Qty", margin + displayColumnWidth + gameColumnWidth + priceColumnWidth + 8f, cursorY + 26f, "F2", 18f, textColor, false);
            DrawCellText("Sales", margin + displayColumnWidth + gameColumnWidth + priceColumnWidth + qtyColumnWidth + 8f, cursorY + 26f, "F2", 18f, textColor, false);
            DrawRowBorders(cursorY, headerHeight);
            cursorY += headerHeight;
        }

        void DrawRowBackground(float rowY, float rowHeight, PdfColor fill)
        {
            DrawRect(currentPage, pageHeight, margin, rowY, contentWidth, rowHeight, fill, borderColor);
        }

        void DrawRowBorders(float rowY, float rowHeight)
        {
            DrawVerticalLine(margin + displayColumnWidth, rowY, rowHeight);
            DrawVerticalLine(margin + displayColumnWidth + gameColumnWidth, rowY, rowHeight);
            DrawVerticalLine(margin + displayColumnWidth + gameColumnWidth + priceColumnWidth, rowY, rowHeight);
            DrawVerticalLine(margin + displayColumnWidth + gameColumnWidth + priceColumnWidth + qtyColumnWidth, rowY, rowHeight);
        }

        void DrawCellText(
            string text,
            float x,
            float yBaselineFromTop,
            string fontName,
            float fontSize,
            PdfColor color,
            bool alignRight)
        {
            if (!alignRight)
            {
                DrawText(currentPage, pageHeight, fontName, fontSize, color, x, yBaselineFromTop, text);
                return;
            }

            var width = EstimatePdfTextWidth(text, fontSize);
            DrawText(currentPage, pageHeight, fontName, fontSize, color, x - width, yBaselineFromTop, text);
        }

        void DrawVerticalLine(float x, float rowY, float rowHeight)
        {
            var y1 = pageHeight - rowY;
            var y2 = pageHeight - rowY - rowHeight;
            currentPage.AppendFormat(CultureInfo.InvariantCulture, "1 w\n{0:0.###} {1:0.###} {2:0.###} RG\n", borderColor.R, borderColor.G, borderColor.B);
            currentPage.AppendFormat(CultureInfo.InvariantCulture, "{0:0.###} {1:0.###} m {0:0.###} {2:0.###} l S\n", x, y1, y2);
        }

        void EnsureSpace(float requiredHeight)
        {
            if (cursorY + requiredHeight <= pageHeight - margin)
            {
                return;
            }

            currentPage = NewPage();
            cursorY = margin;
        }

        StringBuilder NewPage()
        {
            var page = new StringBuilder();
            pages.Add(page);
            return page;
        }
    }

    private static string BuildShiftCloseSummaryPdfFileName(Shift shift, BusinessDay businessDay)
    {
        var shiftSegment = SanitizeFileNameSegment(shift.ShiftName);
        if (string.IsNullOrWhiteSpace(shiftSegment))
        {
            shiftSegment = "shift";
        }

        return $"shift-close-summary-{businessDay.BusinessDate:yyyyMMdd}-{shiftSegment}.pdf";
    }

    private static byte[] BuildPdfFromPageContents(
        IEnumerable<string> pageContents,
        float pageWidth,
        float pageHeight,
        bool includeBoldFont)
    {
        var pages = pageContents.ToArray();
        if (pages.Length == 0)
        {
            pages = [string.Empty];
        }

        var objectBodies = new Dictionary<int, string>
        {
            [1] = "<< /Type /Catalog /Pages 2 0 R >>",
            [3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
        };

        if (includeBoldFont)
        {
            objectBodies[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";
        }

        var pageObjectNumbers = new List<int>();
        var nextObjectNumber = includeBoldFont ? 5 : 4;
        foreach (var content in pages)
        {
            var pageObjectNumber = nextObjectNumber++;
            var contentObjectNumber = nextObjectNumber++;
            pageObjectNumbers.Add(pageObjectNumber);

            var contentLength = Encoding.ASCII.GetByteCount(content);
            objectBodies[contentObjectNumber] = $"<< /Length {contentLength} >>\nstream\n{content}\nendstream";

            var fontResources = includeBoldFont
                ? "/Font << /F1 3 0 R /F2 4 0 R >>"
                : "/Font << /F1 3 0 R >>";

            objectBodies[pageObjectNumber] =
                $"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {pageWidth.ToString("0.###", CultureInfo.InvariantCulture)} {pageHeight.ToString("0.###", CultureInfo.InvariantCulture)}] " +
                $"/Resources << {fontResources} >> /Contents {contentObjectNumber} 0 R >>";
        }

        var kids = string.Join(" ", pageObjectNumbers.Select(number => $"{number} 0 R"));
        objectBodies[2] = $"<< /Type /Pages /Count {pageObjectNumbers.Count} /Kids [ {kids} ] >>";

        var maxObjectNumber = objectBodies.Keys.Max();
        var offsets = new long[maxObjectNumber + 1];

        using var stream = new MemoryStream();
        WriteAscii(stream, "%PDF-1.4\n");

        for (var objectNumber = 1; objectNumber <= maxObjectNumber; objectNumber++)
        {
            offsets[objectNumber] = stream.Position;
            WriteAscii(stream, $"{objectNumber} 0 obj\n{objectBodies[objectNumber]}\nendobj\n");
        }

        var xrefOffset = stream.Position;
        WriteAscii(stream, $"xref\n0 {maxObjectNumber + 1}\n");
        WriteAscii(stream, "0000000000 65535 f \n");

        for (var objectNumber = 1; objectNumber <= maxObjectNumber; objectNumber++)
        {
            WriteAscii(stream, $"{offsets[objectNumber]:0000000000} 00000 n \n");
        }

        WriteAscii(stream, $"trailer\n<< /Size {maxObjectNumber + 1} /Root 1 0 R >>\n");
        WriteAscii(stream, $"startxref\n{xrefOffset}\n%%EOF");
        return stream.ToArray();
    }

    private static string[] WrapTextForPdf(string value, float maxWidth, float fontSize)
    {
        var text = string.IsNullOrWhiteSpace(value) ? "-" : value.Trim();
        var maxChars = Math.Max(6, (int)Math.Floor(maxWidth / (fontSize * 0.53f)));
        var words = text.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var lines = new List<string>();
        var current = new StringBuilder();

        foreach (var word in words)
        {
            if (word.Length > maxChars)
            {
                if (current.Length > 0)
                {
                    lines.Add(current.ToString());
                    current.Clear();
                }

                var start = 0;
                while (start < word.Length)
                {
                    var take = Math.Min(maxChars, word.Length - start);
                    lines.Add(word.Substring(start, take));
                    start += take;
                }

                continue;
            }

            if (current.Length == 0)
            {
                current.Append(word);
                continue;
            }

            if (current.Length + 1 + word.Length <= maxChars)
            {
                current.Append(' ').Append(word);
            }
            else
            {
                lines.Add(current.ToString());
                current.Clear();
                current.Append(word);
            }
        }

        if (current.Length > 0)
        {
            lines.Add(current.ToString());
        }

        return lines.Count == 0 ? ["-"] : lines.ToArray();
    }

    private static void DrawRect(
        StringBuilder sb,
        float pageHeight,
        float x,
        float yTop,
        float width,
        float height,
        PdfColor fill,
        PdfColor stroke)
    {
        var yBottom = pageHeight - yTop - height;
        sb.AppendFormat(CultureInfo.InvariantCulture, "1 w\n{0:0.###} {1:0.###} {2:0.###} RG\n", stroke.R, stroke.G, stroke.B);
        sb.AppendFormat(CultureInfo.InvariantCulture, "{0:0.###} {1:0.###} {2:0.###} rg\n", fill.R, fill.G, fill.B);
        sb.AppendFormat(CultureInfo.InvariantCulture, "{0:0.###} {1:0.###} {2:0.###} {3:0.###} re B\n", x, yBottom, width, height);
    }

    private static void DrawText(
        StringBuilder sb,
        float pageHeight,
        string fontName,
        float fontSize,
        PdfColor color,
        float x,
        float yBaselineFromTop,
        string text)
    {
        var y = pageHeight - yBaselineFromTop;
        sb.Append("BT\n");
        sb.AppendFormat(CultureInfo.InvariantCulture, "/{0} {1:0.###} Tf\n", fontName, fontSize);
        sb.AppendFormat(CultureInfo.InvariantCulture, "{0:0.###} {1:0.###} {2:0.###} rg\n", color.R, color.G, color.B);
        sb.AppendFormat(CultureInfo.InvariantCulture, "1 0 0 1 {0:0.###} {1:0.###} Tm\n", x, y);
        sb.Append('(');
        sb.Append(EscapePdfLiteralText(text));
        sb.Append(") Tj\nET\n");
    }

    private static float EstimatePdfTextWidth(string text, float fontSize)
        => (text?.Length ?? 0) * fontSize * 0.53f;

    private static string EscapePdfLiteralText(string value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return string.Empty;
        }

        var sb = new StringBuilder(value.Length);
        foreach (var character in value)
        {
            switch (character)
            {
                case '\\':
                    sb.Append("\\\\");
                    break;
                case '(':
                    sb.Append("\\(");
                    break;
                case ')':
                    sb.Append("\\)");
                    break;
                case '\u00A3':
                    sb.Append("\\243");
                    break;
                default:
                    if (character >= 32 && character <= 126)
                    {
                        sb.Append(character);
                    }
                    else
                    {
                        sb.Append('?');
                    }

                    break;
            }
        }

        return sb.ToString();
    }

    private readonly record struct PdfColor(float R, float G, float B);

    private static string SanitizeFileNameSegment(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var invalidCharacters = Path.GetInvalidFileNameChars();
        var sb = new StringBuilder(value.Length);
        var lastWasSeparator = false;

        foreach (var character in value.Trim())
        {
            if (invalidCharacters.Contains(character) || char.IsControl(character))
            {
                continue;
            }

            if (char.IsLetterOrDigit(character))
            {
                sb.Append(character);
                lastWasSeparator = false;
                continue;
            }

            if (!lastWasSeparator)
            {
                sb.Append('-');
                lastWasSeparator = true;
            }
        }

        return sb.ToString().Trim('-');
    }

    private static void WriteAscii(Stream stream, string value)
    {
        var bytes = Encoding.ASCII.GetBytes(value);
        stream.Write(bytes, 0, bytes.Length);
    }
}
