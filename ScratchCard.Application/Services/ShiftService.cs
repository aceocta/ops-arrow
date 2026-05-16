using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Models;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Common;
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
    private readonly IAttachmentStorageService _attachmentStorageService;
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
        IAttachmentStorageService attachmentStorageService,
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
        _attachmentStorageService = attachmentStorageService;
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

        await EnsureNoOtherOpenShiftsForBusinessDayAsync(
            request.ShopId,
            request.BusinessDayId,
            excludeShiftId: null,
            actionDescription: "opening a new shift",
            cancellationToken);

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
            OpenedOn = utcNow,
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

        await EnsureNoOtherOpenShiftsForBusinessDayAsync(
            shift.ShopId,
            shift.BusinessDayId,
            excludeShiftId: shift.Id,
            actionDescription: "starting this scheduled shift",
            cancellationToken);

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
        shift.OpenedOn = utcNow;
        shift.ClosedOn = null;
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
        if (businessDayId.HasValue)
        {
            await NormalizeLegacyScheduledShiftWindowsAsync(shopId, businessDayId.Value, cancellationToken);
        }

        var query = _shiftRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId);

        if (businessDayId.HasValue)
        {
            query = query.Where(x => x.BusinessDayId == businessDayId.Value);
        }

        var shiftRows = await query
            .OrderByDescending(x => x.StartTime)
            .Select(x => new ShiftQueryRow(
                x.Id,
                x.BusinessDayId,
                x.ShopId,
                x.ShiftName,
                x.StartTime,
                x.EndTime,
                x.OpenedOn,
                x.ClosedOn,
                x.Status,
                x.SyncStatus,
                x.Notes))
            .ToListAsync(cancellationToken);

        if (shiftRows.Count == 0)
        {
            return [];
        }

        var attachmentsByShiftId = await GetCloseAttachmentsByShiftIdAsync(
            shiftRows.Select(x => x.Id).ToArray(),
            cancellationToken);

        return shiftRows
            .Select(row => ToShiftDto(row, attachmentsByShiftId.GetValueOrDefault(row.Id, [])))
            .ToArray();
    }

    public async Task<IReadOnlyCollection<ShiftCloseCandidateDto>> ListCloseCandidatesAsync(
        Guid shopId,
        CancellationToken cancellationToken = default)
    {
        var rows = await _shiftRepository.Query()
            .AsNoTracking()
            .Where(x =>
                x.ShopId == shopId &&
                (x.Status == ShiftStatus.Open || x.Status == ShiftStatus.Reopened) &&
                (x.BusinessDay.Status == BusinessDayStatus.Open ||
                 x.BusinessDay.Status == BusinessDayStatus.Reopened ||
                 x.BusinessDay.Status == BusinessDayStatus.ReadyToClose))
            .OrderByDescending(x => x.StartTime)
            .Select(x => new ShiftCloseCandidateQueryRow(
                x.Id,
                x.ShopId,
                x.BusinessDayId,
                x.BusinessDay.BusinessDate,
                x.BusinessDay.Status,
                x.ShiftName,
                x.Status,
                x.SyncStatus,
                x.StartTime,
                x.EndTime))
            .ToListAsync(cancellationToken);

        return rows
            .Select(x => new ShiftCloseCandidateDto
            {
                Id = x.Id,
                ShopId = x.ShopId,
                BusinessDayId = x.BusinessDayId,
                BusinessDate = x.BusinessDate,
                BusinessDayStatus = x.BusinessDayStatus.ToString(),
                ShiftName = x.ShiftName,
                Status = x.ShiftStatus.ToString(),
                SyncStatus = x.SyncStatus.ToString(),
                StartTime = x.StartTime,
                EndTime = x.EndTime
            })
            .ToArray();
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
        var shiftRow = await _shiftRepository.Query()
            .AsNoTracking()
            .Where(x => x.Id == id)
            .Select(x => new ShiftQueryRow(
                x.Id,
                x.BusinessDayId,
                x.ShopId,
                x.ShiftName,
                x.StartTime,
                x.EndTime,
                x.OpenedOn,
                x.ClosedOn,
                x.Status,
                x.SyncStatus,
                x.Notes))
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new AppException("shift_not_found", "Shift not found.", 404);

        var attachmentsByShiftId = await GetCloseAttachmentsByShiftIdAsync([shiftRow.Id], cancellationToken);
        return ToShiftDto(shiftRow, attachmentsByShiftId.GetValueOrDefault(shiftRow.Id, []));
    }

    public async Task<string?> GetCloseAttachmentDataUrlAsync(Guid attachmentId, CancellationToken cancellationToken = default)
    {
        var attachment = await _shiftCloseAttachmentRepository.Query()
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == attachmentId, cancellationToken)
            ?? throw new AppException("shift_attachment_not_found", "Shift attachment not found.", 404);

        return await ReadAttachmentDataUrlAsync(
            _attachmentStorageService,
            attachment.StoredPath,
            attachment.ContentType,
            cancellationToken);
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
        if (!ShiftMetadata.IsAutoCreated(shift.Notes))
        {
            shift.EndTime = null;
        }
        shift.ClosedOn = null;
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

    private async Task<Dictionary<Guid, IReadOnlyCollection<CloseAttachmentDto>>> GetCloseAttachmentsByShiftIdAsync(
        IReadOnlyCollection<Guid> shiftIds,
        CancellationToken cancellationToken)
    {
        if (shiftIds.Count == 0)
        {
            return new Dictionary<Guid, IReadOnlyCollection<CloseAttachmentDto>>();
        }

        var shiftIdValues = shiftIds.Distinct().ToArray();
        var rows = new List<ShiftAttachmentProjection>();

        foreach (var chunk in shiftIdValues.Chunk(1000))
        {
            var chunkRows = await _shiftCloseAttachmentRepository.Query()
                .AsNoTracking()
                .Where(x => chunk.Contains(x.ShiftReconciliation.ShiftId))
                .Select(x => new ShiftAttachmentProjection
                {
                    ShiftId = x.ShiftReconciliation.ShiftId,
                    Attachment = new CloseAttachmentDto
                    {
                        Id = x.Id,
                        FileName = x.OriginalFileName,
                        ContentType = x.ContentType,
                        FileSizeBytes = x.FileSizeBytes,
                        UploadedOn = x.CreatedOn
                    }
                })
                .ToListAsync(cancellationToken);

            rows.AddRange(chunkRows);
        }

        return rows
            .GroupBy(x => x.ShiftId)
            .ToDictionary(
                group => group.Key,
                group => (IReadOnlyCollection<CloseAttachmentDto>)group
                    .Select(x => x.Attachment)
                    .OrderByDescending(x => x.UploadedOn)
                    .ToArray());
    }

    private static ShiftDto ToShiftDto(ShiftQueryRow row, IReadOnlyCollection<CloseAttachmentDto> attachments) => new()
    {
        Id = row.Id,
        BusinessDayId = row.BusinessDayId,
        ShopId = row.ShopId,
        ShiftName = row.ShiftName,
        StartTime = row.StartTime,
        EndTime = row.EndTime,
        OpenedOn = row.OpenedOn,
        ClosedOn = row.ClosedOn,
        Status = row.Status.ToString(),
        SyncStatus = row.SyncStatus.ToString(),
        IsAutoCreated = ShiftMetadata.IsAutoCreated(row.Notes),
        AutoTemplateId = ShiftMetadata.TryGetAutoTemplateId(row.Notes, out var templateId) && !string.IsNullOrWhiteSpace(templateId)
            ? templateId
            : null,
        CloseAttachments = attachments
    };

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

    private sealed record ShiftQueryRow(
        Guid Id,
        Guid BusinessDayId,
        Guid ShopId,
        string ShiftName,
        DateTimeOffset StartTime,
        DateTimeOffset? EndTime,
        DateTimeOffset? OpenedOn,
        DateTimeOffset? ClosedOn,
        ShiftStatus Status,
        SyncStatus SyncStatus,
        string? Notes);

    private sealed record ShiftCloseCandidateQueryRow(
        Guid Id,
        Guid ShopId,
        Guid BusinessDayId,
        DateOnly BusinessDate,
        BusinessDayStatus BusinessDayStatus,
        string ShiftName,
        ShiftStatus ShiftStatus,
        SyncStatus SyncStatus,
        DateTimeOffset StartTime,
        DateTimeOffset? EndTime);

    private sealed class ShiftAttachmentProjection
    {
        public Guid ShiftId { get; set; }
        public CloseAttachmentDto Attachment { get; set; } = new();
    }

    private async Task EnsureNoOtherOpenShiftsForBusinessDayAsync(
        Guid shopId,
        Guid businessDayId,
        Guid? excludeShiftId,
        string actionDescription,
        CancellationToken cancellationToken)
    {
        var openShiftQuery = _shiftRepository.Query()
            .AsNoTracking()
            .Where(x =>
                x.ShopId == shopId &&
                x.BusinessDayId == businessDayId &&
                (x.Status == ShiftStatus.Open || x.Status == ShiftStatus.Reopened));

        if (excludeShiftId.HasValue)
        {
            openShiftQuery = openShiftQuery.Where(x => x.Id != excludeShiftId.Value);
        }

        var openShiftNames = await openShiftQuery
            .Select(x => x.ShiftName)
            .ToListAsync(cancellationToken);

        if (openShiftNames.Count == 0)
        {
            return;
        }

        var openShiftList = string.Join(", ", openShiftNames.Distinct(StringComparer.OrdinalIgnoreCase));
        throw new AppException(
            ErrorCodes.BusinessDayHasOpenShifts,
            $"Close existing open shift(s) first ({openShiftList}) before {actionDescription}.",
            409);
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

    private async Task NormalizeLegacyScheduledShiftWindowsAsync(
        Guid shopId,
        Guid businessDayId,
        CancellationToken cancellationToken)
    {
        var businessDay = await _businessDayRepository.Query()
            .AsNoTracking()
            .Where(x => x.Id == businessDayId && x.ShopId == shopId)
            .Select(x => new { x.Id, x.BusinessDate })
            .FirstOrDefaultAsync(cancellationToken);

        if (businessDay is null)
        {
            return;
        }

        var businessSetup = await _shopConfigurationService.GetBusinessDaySetupAsync(shopId, cancellationToken);
        if (businessSetup.BusinessStartTime <= businessSetup.BusinessEndTime)
        {
            return;
        }

        var shiftSetup = await _shopConfigurationService.GetShiftSetupAsync(shopId, cancellationToken);
        var scheduledShifts = await _shiftRepository.Query()
            .Where(x =>
                x.ShopId == shopId &&
                x.BusinessDayId == businessDayId &&
                x.Status == ShiftStatus.Scheduled &&
                x.EndTime.HasValue)
            .ToListAsync(cancellationToken);

        if (scheduledShifts.Count == 0)
        {
            return;
        }

        var hasChanges = false;
        foreach (var shift in scheduledShifts)
        {
            if (!ShiftMetadata.IsAutoCreated(shift.Notes))
            {
                continue;
            }

            if (!ShiftMetadata.TryGetAutoWindow(shift.Notes, out var templateStartTime, out var templateEndTime))
            {
                continue;
            }

            if (templateStartTime <= templateEndTime)
            {
                continue;
            }

            var currentLocalStart = ConvertToShopTime(shift.StartTime, shiftSetup.TimeZoneId);
            var currentLocalEnd = ConvertToShopTime(shift.EndTime!.Value, shiftSetup.TimeZoneId);
            var isLegacyWindowPlacement =
                DateOnly.FromDateTime(currentLocalStart.DateTime) == businessDay.BusinessDate &&
                DateOnly.FromDateTime(currentLocalEnd.DateTime) == businessDay.BusinessDate.AddDays(1) &&
                currentLocalStart.Hour == templateStartTime.Hours &&
                currentLocalStart.Minute == templateStartTime.Minutes &&
                currentLocalEnd.Hour == templateEndTime.Hours &&
                currentLocalEnd.Minute == templateEndTime.Minutes;

            if (!isLegacyWindowPlacement)
            {
                continue;
            }

            var (expectedStartDate, expectedEndDate) = ResolveScheduledShiftDates(
                businessDay.BusinessDate,
                templateStartTime,
                templateEndTime,
                businessSetup.BusinessStartTime,
                businessSetup.BusinessEndTime);
            var expectedStartUtc = ToUtcDateTime(expectedStartDate, templateStartTime, shiftSetup.TimeZoneId);
            var expectedEndUtc = ToUtcDateTime(expectedEndDate, templateEndTime, shiftSetup.TimeZoneId);

            if (shift.StartTime == expectedStartUtc && shift.EndTime == expectedEndUtc)
            {
                continue;
            }

            shift.StartTime = expectedStartUtc;
            shift.EndTime = expectedEndUtc;
            shift.ModifiedOn = DateTimeOffset.UtcNow;
            shift.ModifiedBy = _currentUserService.UserId;
            _shiftRepository.Update(shift);
            hasChanges = true;

            await _auditService.LogAsync(
                nameof(Shift),
                shift.Id,
                "LegacyScheduledShiftWindowCorrected",
                shift.ShopId,
                reason: $"Business day {businessDay.BusinessDate:yyyy-MM-dd}: adjusted from legacy overnight date placement.",
                cancellationToken: cancellationToken);
        }

        if (hasChanges)
        {
            await _unitOfWork.SaveChangesAsync(cancellationToken);
        }
    }

    private static (DateOnly StartDate, DateOnly EndDate) ResolveScheduledShiftDates(
        DateOnly businessDate,
        TimeSpan shiftStartTime,
        TimeSpan shiftEndTime,
        TimeSpan businessStartTime,
        TimeSpan businessEndTime)
    {
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

        var defaultStartDate = businessDate;
        var defaultEndDate = shiftEndTime <= shiftStartTime
            ? businessDate.AddDays(1)
            : businessDate;
        return (defaultStartDate, defaultEndDate);
    }

    private static DateTimeOffset ToUtcDateTime(DateOnly businessDate, TimeSpan timeOfDay, string? timeZoneId)
    {
        var localDateTime = businessDate.ToDateTime(TimeOnly.FromTimeSpan(timeOfDay), DateTimeKind.Unspecified);

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

        var resolved = string.IsNullOrWhiteSpace(timeZoneId)
            ? null
            : TryResolveTimeZone(timeZoneId.Trim());

        if (resolved is null && string.Equals(timeZoneId?.Trim(), "Europe/London", StringComparison.OrdinalIgnoreCase))
        {
            resolved = TryResolveTimeZone("GMT Standard Time");
        }
        else if (resolved is null && string.Equals(timeZoneId?.Trim(), "GMT Standard Time", StringComparison.OrdinalIgnoreCase))
        {
            resolved = TryResolveTimeZone("Europe/London");
        }

        if (resolved is null)
        {
            return new DateTimeOffset(localDateTime, TimeSpan.Zero);
        }

        var offset = resolved.GetUtcOffset(localDateTime);
        var localOffsetTime = new DateTimeOffset(localDateTime, offset);
        return localOffsetTime.ToUniversalTime();
    }
}
