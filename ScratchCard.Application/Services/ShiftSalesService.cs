using System.Text;
using System.Globalization;
using System.Net;
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
    private readonly IAuditService _auditService;
    private readonly ICurrentUserService _currentUserService;
    private readonly IUnitOfWork _unitOfWork;

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
        IAuditService auditService,
        ICurrentUserService currentUserService,
        IUnitOfWork unitOfWork)
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
            CloseAttachmentStorage.TryDelete(existingAttachment.StoredPath);
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
        if (hasFlags)
        {
            await SendManualEntryNotificationsAsync(shift, businessDay, salesEntries, cancellationToken);
        }

        await SendShiftCloseSummaryToOwnersAsync(shift, businessDay, salesEntries, packs, cancellationToken);

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
        var recipients = await _shopUserRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shift.ShopId && x.IsActive && x.Role.Name == RoleNames.ShopOwner)
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

        var subject = $"Shift Close Summary - {shopName} - {businessDay.BusinessDate:yyyy-MM-dd} - {shift.ShiftName}";
        var body = BuildShiftCloseSummaryBodyHtml(shopName, shift, businessDay, entries, packs);

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

    private static string BuildShiftCloseSummaryBodyHtml(
        string shopName,
        Shift shift,
        BusinessDay businessDay,
        IReadOnlyCollection<ShiftScratchCardSale> entries,
        IReadOnlyDictionary<Guid, ScratchCardPack> packs)
    {
        var rows = entries
            .Select(entry =>
            {
                packs.TryGetValue(entry.PackId, out var pack);
                var displayNumber = pack?.DisplayNumber;
                var gameName = pack?.Game?.GameName ?? "Unknown";
                return new
                {
                    DisplayNumber = displayNumber,
                    GameName = gameName,
                    TicketPrice = entry.TicketPrice,
                    SoldQuantity = entry.SoldQuantity,
                    SalesAmount = entry.SalesAmount
                };
            })
            .OrderBy(x => x.DisplayNumber ?? int.MaxValue)
            .ThenBy(x => x.GameName, StringComparer.OrdinalIgnoreCase)
            .ToArray();

        var totalSoldQty = rows.Sum(x => x.SoldQuantity);
        var totalSales = rows.Sum(x => x.SalesAmount);

        var sb = new StringBuilder();
        sb.Append("<html><body style=\"font-family:Arial,Helvetica,sans-serif;color:#172033;\">");
        sb.Append($"<h3 style=\"margin:0 0 8px 0;\">Shift Close Summary</h3>");
        sb.Append("<div style=\"margin-bottom:12px;\">");
        sb.Append($"<div><strong>Shop:</strong> {WebUtility.HtmlEncode(shopName)}</div>");
        sb.Append($"<div><strong>Business Date:</strong> {businessDay.BusinessDate:yyyy-MM-dd}</div>");
        sb.Append($"<div><strong>Shift:</strong> {WebUtility.HtmlEncode(shift.ShiftName)}</div>");
        sb.Append($"<div><strong>Closed Time (UTC):</strong> {(shift.EndTime?.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture) ?? "-")}</div>");
        sb.Append("</div>");
        sb.Append("<table style=\"border-collapse:collapse;width:100%;font-size:13px;\">");
        sb.Append("<thead><tr style=\"background:#EEF3FB;\">");
        sb.Append("<th style=\"border:1px solid #C7D2E3;padding:6px;text-align:left;\">Display No</th>");
        sb.Append("<th style=\"border:1px solid #C7D2E3;padding:6px;text-align:left;\">Game Name</th>");
        sb.Append("<th style=\"border:1px solid #C7D2E3;padding:6px;text-align:right;\">Price</th>");
        sb.Append("<th style=\"border:1px solid #C7D2E3;padding:6px;text-align:right;\">Sold Qty</th>");
        sb.Append("<th style=\"border:1px solid #C7D2E3;padding:6px;text-align:right;\">Sales Total</th>");
        sb.Append("</tr></thead><tbody>");

        if (rows.Length == 0)
        {
            sb.Append("<tr><td colspan=\"5\" style=\"border:1px solid #C7D2E3;padding:8px;text-align:center;\">No shift entries.</td></tr>");
        }
        else
        {
            foreach (var row in rows)
            {
                sb.Append("<tr>");
                sb.Append($"<td style=\"border:1px solid #C7D2E3;padding:6px;\">{(row.DisplayNumber.HasValue ? row.DisplayNumber.Value.ToString(CultureInfo.InvariantCulture) : "-")}</td>");
                sb.Append($"<td style=\"border:1px solid #C7D2E3;padding:6px;\">{WebUtility.HtmlEncode(row.GameName)}</td>");
                sb.Append($"<td style=\"border:1px solid #C7D2E3;padding:6px;text-align:right;\">{row.TicketPrice.ToString("0.00", CultureInfo.InvariantCulture)}</td>");
                sb.Append($"<td style=\"border:1px solid #C7D2E3;padding:6px;text-align:right;\">{row.SoldQuantity}</td>");
                sb.Append($"<td style=\"border:1px solid #C7D2E3;padding:6px;text-align:right;\">{row.SalesAmount.ToString("0.00", CultureInfo.InvariantCulture)}</td>");
                sb.Append("</tr>");
            }
        }

        sb.Append("<tr style=\"background:#F5F8FD;font-weight:700;\">");
        sb.Append("<td colspan=\"3\" style=\"border:1px solid #C7D2E3;padding:6px;text-align:right;\">Total</td>");
        sb.Append($"<td style=\"border:1px solid #C7D2E3;padding:6px;text-align:right;\">{totalSoldQty}</td>");
        sb.Append($"<td style=\"border:1px solid #C7D2E3;padding:6px;text-align:right;\">{totalSales.ToString("0.00", CultureInfo.InvariantCulture)}</td>");
        sb.Append("</tr>");

        sb.Append("</tbody></table></body></html>");
        return sb.ToString();
    }
}

