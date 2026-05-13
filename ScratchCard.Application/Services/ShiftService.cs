using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Models;
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
    private const string DefaultShiftName = "Main Shift";

    private readonly IRepository<Shift> _shiftRepository;
    private readonly IRepository<BusinessDay> _businessDayRepository;
    private readonly IRepository<ScratchCardPack> _packRepository;
    private readonly IRepository<ShiftOpeningSerial> _shiftOpeningSerialRepository;
    private readonly IRepository<ShiftCloseAttachment> _shiftCloseAttachmentRepository;
    private readonly IShopConfigurationService _shopConfigurationService;
    private readonly IShiftSalesService _shiftSalesService;
    private readonly IAuditService _auditService;
    private readonly ICurrentUserService _currentUserService;
    private readonly IUnitOfWork _unitOfWork;

    public ShiftService(
        IRepository<Shift> shiftRepository,
        IRepository<BusinessDay> businessDayRepository,
        IRepository<ScratchCardPack> packRepository,
        IRepository<ShiftOpeningSerial> shiftOpeningSerialRepository,
        IRepository<ShiftCloseAttachment> shiftCloseAttachmentRepository,
        IShopConfigurationService shopConfigurationService,
        IShiftSalesService shiftSalesService,
        IAuditService auditService,
        ICurrentUserService currentUserService,
        IUnitOfWork unitOfWork)
    {
        _shiftRepository = shiftRepository;
        _businessDayRepository = businessDayRepository;
        _packRepository = packRepository;
        _shiftOpeningSerialRepository = shiftOpeningSerialRepository;
        _shiftCloseAttachmentRepository = shiftCloseAttachmentRepository;
        _shopConfigurationService = shopConfigurationService;
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

        if (businessDay.ShopId != request.ShopId)
        {
            throw new AppException("invalid_shop_for_business_day", "Business day does not belong to the provided shop.", 400);
        }

        var setup = await _shopConfigurationService.GetShiftSetupAsync(request.ShopId, cancellationToken);
        var utcNow = DateTimeOffset.UtcNow;
        var shopNow = ConvertToShopTime(utcNow, setup.TimeZoneId);

        if (setup.EnforceShiftTimeWindow && !IsWithinAnyShiftWindow(shopNow.TimeOfDay, setup.ShiftTemplates))
        {
            throw new AppException(
                "shift_outside_time_window",
                $"Shift can only be opened inside a configured shift window ({setup.TimeZoneId}).",
                400);
        }

        var shiftName = ResolveShiftName(request.ShiftName, setup);
        if (shiftName.Length > 100)
        {
            shiftName = shiftName[..100].TrimEnd();
        }
        if (string.IsNullOrWhiteSpace(shiftName))
        {
            shiftName = DefaultShiftName;
        }

        var duplicateShift = await _shiftRepository.Query()
            .AsNoTracking()
            .AnyAsync(
                x => x.BusinessDayId == request.BusinessDayId &&
                     x.ShopId == request.ShopId &&
                     x.ShiftName == shiftName,
                cancellationToken);

        if (duplicateShift && setup.AllowCustomShiftName)
        {
            throw new AppException("duplicate_shift_name", $"Shift '{shiftName}' already exists for this business day.", 409);
        }

        if (duplicateShift && !setup.AllowCustomShiftName)
        {
            var sequence = 2;
            var baseName = shiftName;
            while (true)
            {
                var suffix = $" {sequence}";
                var allowedNameLength = Math.Max(1, 100 - suffix.Length);
                var trimmedBase = baseName.Length > allowedNameLength
                    ? baseName[..allowedNameLength].TrimEnd()
                    : baseName;
                shiftName = $"{trimmedBase}{suffix}";

                var exists = await _shiftRepository.Query()
                    .AsNoTracking()
                    .AnyAsync(
                        x => x.BusinessDayId == request.BusinessDayId &&
                             x.ShopId == request.ShopId &&
                             x.ShiftName == shiftName,
                        cancellationToken);

                if (!exists)
                {
                    break;
                }

                sequence++;
            }
        }

        var packSetup = await _shopConfigurationService.GetPackSetupAsync(request.ShopId, cancellationToken);
        var activePacks = await _packRepository.Query()
            .Include(x => x.Game)
            .Where(x => x.ShopId == request.ShopId && x.Status == PackStatus.Active && !x.IsDeleted)
            .ToListAsync(cancellationToken);

        var openingSerialEntries = ResolveOpeningSerialEntries(
            request.OpeningSerialConfirmations,
            activePacks,
            packSetup.SellingOrder);

        var shift = new Shift
        {
            BusinessDayId = request.BusinessDayId,
            ShopId = request.ShopId,
            ShiftName = shiftName,
            StartTime = utcNow,
            OpenedByUserId = _currentUserService.UserId ?? Guid.Empty,
            Status = ShiftStatus.Open,
            SyncStatus = SyncStatus.Synced,
            CreatedOn = utcNow,
            CreatedBy = _currentUserService.UserId
        };

        await _shiftRepository.AddAsync(shift, cancellationToken);

        if (openingSerialEntries.Count > 0)
        {
            var openingSerialRows = openingSerialEntries.Select(entry => new ShiftOpeningSerial
            {
                ShiftId = shift.Id,
                BusinessDayId = request.BusinessDayId,
                ShopId = request.ShopId,
                PackId = entry.Pack.Id,
                ExpectedOpeningSerialNumber = entry.ExpectedOpeningSerialNumber,
                ActualOpeningSerialNumber = entry.ActualOpeningSerialNumber,
                MissingQuantity = entry.MissingQuantity,
                OverageQuantity = entry.OverageQuantity,
                CreatedOn = utcNow,
                CreatedBy = _currentUserService.UserId
            }).ToArray();

            await _shiftOpeningSerialRepository.AddRangeAsync(openingSerialRows, cancellationToken);

            foreach (var entry in openingSerialEntries)
            {
                entry.Pack.CurrentSerialNumber = entry.ActualOpeningSerialNumber;
                entry.Pack.ModifiedOn = utcNow;
                entry.Pack.ModifiedBy = _currentUserService.UserId;
                _packRepository.Update(entry.Pack);
            }
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(nameof(Shift), shift.Id, "ShiftOpened", shift.ShopId, cancellationToken: cancellationToken);
        return shift.ToDto();
    }

    public async Task<ShiftDto> StartScheduledAsync(Guid id, StartScheduledShiftRequest request, CancellationToken cancellationToken = default)
    {
        var shift = await _shiftRepository.GetByIdAsync(id, cancellationToken)
            ?? throw new AppException("shift_not_found", "Shift not found.", 404);

        if (shift.Status != ShiftStatus.Scheduled)
        {
            throw new AppException("shift_not_scheduled", "Only scheduled shifts can be started.", 409);
        }

        var businessDay = await _businessDayRepository.GetByIdAsync(shift.BusinessDayId, cancellationToken)
            ?? throw new AppException("business_day_not_found", "Business day not found.", 404);

        if (businessDay.Status == BusinessDayStatus.Closed)
        {
            throw new AppException("business_day_closed", "Cannot start a shift for a closed business day.", 400);
        }

        var packSetup = await _shopConfigurationService.GetPackSetupAsync(shift.ShopId, cancellationToken);
        var activePacks = await _packRepository.Query()
            .Include(x => x.Game)
            .Where(x => x.ShopId == shift.ShopId && x.Status == PackStatus.Active && !x.IsDeleted)
            .ToListAsync(cancellationToken);
        var openingSerialEntries = ResolveOpeningSerialEntries(
            request.OpeningSerialConfirmations,
            activePacks,
            packSetup.SellingOrder);

        var utcNow = DateTimeOffset.UtcNow;
        shift.Status = ShiftStatus.Open;
        shift.StartTime = utcNow;
        shift.EndTime = null;
        shift.OpenedByUserId = _currentUserService.UserId ?? Guid.Empty;
        shift.SyncStatus = SyncStatus.Synced;
        shift.ModifiedOn = utcNow;
        shift.ModifiedBy = _currentUserService.UserId;

        _shiftRepository.Update(shift);

        if (openingSerialEntries.Count > 0)
        {
            var openingSerialRows = openingSerialEntries.Select(entry => new ShiftOpeningSerial
            {
                ShiftId = shift.Id,
                BusinessDayId = shift.BusinessDayId,
                ShopId = shift.ShopId,
                PackId = entry.Pack.Id,
                ExpectedOpeningSerialNumber = entry.ExpectedOpeningSerialNumber,
                ActualOpeningSerialNumber = entry.ActualOpeningSerialNumber,
                MissingQuantity = entry.MissingQuantity,
                OverageQuantity = entry.OverageQuantity,
                CreatedOn = utcNow,
                CreatedBy = _currentUserService.UserId
            }).ToArray();
            await _shiftOpeningSerialRepository.AddRangeAsync(openingSerialRows, cancellationToken);

            foreach (var entry in openingSerialEntries)
            {
                entry.Pack.CurrentSerialNumber = entry.ActualOpeningSerialNumber;
                entry.Pack.ModifiedOn = utcNow;
                entry.Pack.ModifiedBy = _currentUserService.UserId;
                _packRepository.Update(entry.Pack);
            }
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(nameof(Shift), shift.Id, "ScheduledShiftStarted", shift.ShopId, cancellationToken: cancellationToken);
        return shift.ToDto();
    }

    public async Task<IReadOnlyCollection<ShiftDto>> ListAsync(Guid shopId, Guid? businessDayId = null, CancellationToken cancellationToken = default)
    {
        var query = _shiftRepository.Query()
            .AsNoTracking()
            .Include(x => x.ShiftReconciliation)
                .ThenInclude(x => x!.Attachments)
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

    public async Task DeleteAsync(Guid id, DeleteShiftRequest request, CancellationToken cancellationToken = default)
    {
        var shift = await _shiftRepository.GetByIdAsync(id, cancellationToken)
            ?? throw new AppException("shift_not_found", "Shift not found.", 404);

        if (!ShiftMetadata.IsAutoCreated(shift.Notes))
        {
            throw new AppException("shift_delete_not_allowed", "Only auto-created shifts can be deleted from this screen.", 409);
        }

        if (shift.Status != ShiftStatus.Scheduled)
        {
            throw new AppException("shift_delete_not_allowed", "Only scheduled auto-created shifts can be deleted.", 409);
        }

        _shiftRepository.Remove(shift);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(
            nameof(Shift),
            shift.Id,
            "AutoCreatedShiftDeleted",
            shift.ShopId,
            reason: request.Reason,
            cancellationToken: cancellationToken);
    }

    public async Task<ShiftDto> GetAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var shift = await _shiftRepository.Query()
            .AsNoTracking()
            .Include(x => x.ShiftReconciliation)
                .ThenInclude(x => x!.Attachments)
            .FirstOrDefaultAsync(x => x.Id == id, cancellationToken)
            ?? throw new AppException("shift_not_found", "Shift not found.", 404);

        return shift.ToDto();
    }

    public async Task<string?> GetCloseAttachmentDataUrlAsync(Guid attachmentId, CancellationToken cancellationToken = default)
    {
        var attachment = await _shiftCloseAttachmentRepository.Query()
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == attachmentId, cancellationToken)
            ?? throw new AppException("shift_attachment_not_found", "Shift attachment not found.", 404);

        return await ReadAttachmentDataUrlAsync(attachment.StoredPath, attachment.ContentType, cancellationToken);
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

        var packSetup = await _shopConfigurationService.GetPackSetupAsync(shift.ShopId, cancellationToken);
        var packs = await _packRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shift.ShopId && x.Status == PackStatus.Active && !x.IsDeleted)
            .Include(x => x.Game)
            .ToListAsync(cancellationToken);

        return packs
            .Select(x =>
            {
                var dto = x.ToDto();
                dto.SellingOrder = packSetup.SellingOrder;
                return dto;
            })
            .ToArray();
    }

    private static IReadOnlyCollection<ResolvedOpeningSerialEntry> ResolveOpeningSerialEntries(
        IReadOnlyCollection<OpenShiftPackSerialConfirmationRequest>? confirmations,
        IReadOnlyCollection<ScratchCardPack> activePacks,
        SellingOrder sellingOrder)
    {
        if (activePacks.Count == 0)
        {
            return [];
        }

        var submittedConfirmations = confirmations ?? [];
        if (submittedConfirmations.Count == 0)
        {
            throw new AppException(
                "opening_serial_confirmation_required",
                "Confirm opening serial numbers for all active packs before opening a shift.",
                400);
        }

        var activePackById = activePacks.ToDictionary(x => x.Id);
        var confirmationByPackId = new Dictionary<Guid, OpenShiftPackSerialConfirmationRequest>();

        foreach (var confirmation in submittedConfirmations)
        {
            if (confirmationByPackId.ContainsKey(confirmation.PackId))
            {
                throw new AppException(
                    "duplicate_opening_serial_confirmation",
                    "Duplicate opening serial confirmation was submitted for the same pack.",
                    400);
            }

            confirmationByPackId[confirmation.PackId] = confirmation;
        }

        var unknownConfirmation = submittedConfirmations.FirstOrDefault(x => !activePackById.ContainsKey(x.PackId));
        if (unknownConfirmation is not null)
        {
            throw new AppException(
                "invalid_opening_serial_confirmation_pack",
                "Opening serial confirmation included a pack that is not currently active.",
                400);
        }

        var resolvedEntries = new List<ResolvedOpeningSerialEntry>(activePacks.Count);
        foreach (var activePack in activePacks)
        {
            if (!confirmationByPackId.TryGetValue(activePack.Id, out var confirmation))
            {
                throw new AppException(
                    "missing_opening_serial_confirmation",
                    $"Missing opening serial confirmation for pack {activePack.PackNumber}.",
                    400);
            }

            var expected = activePack.CurrentSerialNumber?.Trim() ?? string.Empty;
            var actual = confirmation.OpeningSerialNumber?.Trim() ?? string.Empty;
            EnsureSerialIsWithinPackRange(activePack, actual);
            EnsureSerialIsWithinPackRange(activePack, expected);

            var (missingQuantity, overageQuantity) = CalculateOpeningGap(expected, actual, sellingOrder);
            resolvedEntries.Add(new ResolvedOpeningSerialEntry(
                activePack,
                expected,
                actual,
                missingQuantity,
                overageQuantity));
        }

        return resolvedEntries;
    }

    private static (int missingQuantity, int overageQuantity) CalculateOpeningGap(
        string expectedOpeningSerial,
        string actualOpeningSerial,
        SellingOrder sellingOrder)
    {
        if (!int.TryParse(expectedOpeningSerial, out var expected) || !int.TryParse(actualOpeningSerial, out var actual))
        {
            throw new AppException(ErrorCodes.InvalidSerialRange, "Serial numbers must be numeric.");
        }

        var normalizedSellingOrder = sellingOrder == (SellingOrder)0 ? SellingOrder.Ascending : sellingOrder;
        var delta = normalizedSellingOrder == SellingOrder.Descending
            ? expected - actual
            : actual - expected;

        return delta >= 0
            ? (delta, 0)
            : (0, Math.Abs(delta));
    }

    private static void EnsureSerialIsWithinPackRange(ScratchCardPack pack, string serial)
    {
        if (!int.TryParse(serial, out var serialNo) ||
            !int.TryParse(pack.StartSerialNumber, out var startNo) ||
            !int.TryParse(pack.EndSerialNumber, out var endNo))
        {
            throw new AppException(ErrorCodes.InvalidSerialRange, "Serial numbers must be numeric.");
        }

        var min = Math.Min(startNo, endNo);
        var max = Math.Max(startNo, endNo);
        if (serialNo < min || serialNo > max)
        {
            var displayLabel = pack.DisplayNumber.HasValue ? pack.DisplayNumber.Value.ToString() : "-";
            var gameName = pack.Game?.GameName ?? string.Empty;
            var gameCode = pack.Game?.GameCode ?? string.Empty;
            throw new AppException(
                ErrorCodes.InvalidSerialRange,
                $"Starting serial for display {displayLabel} ({gameName} {gameCode}) must be within pack range {min}-{max}.",
                400);
        }
    }

    private sealed record ResolvedOpeningSerialEntry(
        ScratchCardPack Pack,
        string ExpectedOpeningSerialNumber,
        string ActualOpeningSerialNumber,
        int MissingQuantity,
        int OverageQuantity);

    private static async Task<string?> ReadAttachmentDataUrlAsync(
        string? storedPath,
        string? contentType,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(storedPath) || !File.Exists(storedPath))
        {
            return null;
        }

        var bytes = await File.ReadAllBytesAsync(storedPath, cancellationToken);
        if (bytes.Length == 0)
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

    private static string ResolveShiftName(string? requestedShiftName, ShopShiftSetup setup)
    {
        var configuredName = string.IsNullOrWhiteSpace(setup.DefaultShiftName)
            ? DefaultShiftName
            : setup.DefaultShiftName.Trim();

        var requestedName = requestedShiftName?.Trim();
        if (!setup.AllowCustomShiftName || string.IsNullOrWhiteSpace(requestedName))
        {
            return configuredName;
        }

        return requestedName;
    }

    private static bool IsWithinAnyShiftWindow(TimeSpan current, IReadOnlyCollection<ShopShiftTemplate> templates)
    {
        var activeTemplates = templates.Where(x => x.IsActive).ToArray();
        if (activeTemplates.Length == 0)
        {
            return true;
        }

        foreach (var template in activeTemplates)
        {
            if (IsWithinShiftWindow(current, template.StartTime, template.EndTime))
            {
                return true;
            }
        }

        return false;
    }

    private static bool IsWithinShiftWindow(TimeSpan current, TimeSpan start, TimeSpan end)
    {
        if (start == end)
        {
            return true;
        }

        if (start < end)
        {
            return current >= start && current <= end;
        }

        return current >= start || current <= end;
    }

    private static DateTimeOffset ConvertToShopTime(DateTimeOffset utcNow, string? timeZoneId)
    {
        if (string.IsNullOrWhiteSpace(timeZoneId))
        {
            return utcNow;
        }

        static TimeZoneInfo? TryResolveTimeZone(string id)
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

        var resolved = TryResolveTimeZone(timeZoneId.Trim());
        if (resolved is null && string.Equals(timeZoneId.Trim(), "Europe/London", StringComparison.OrdinalIgnoreCase))
        {
            resolved = TryResolveTimeZone("GMT Standard Time");
        }
        else if (resolved is null && string.Equals(timeZoneId.Trim(), "GMT Standard Time", StringComparison.OrdinalIgnoreCase))
        {
            resolved = TryResolveTimeZone("Europe/London");
        }

        return resolved is null ? utcNow : TimeZoneInfo.ConvertTime(utcNow, resolved);
    }
}
