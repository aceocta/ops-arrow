using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Extensions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.TemperatureLogs;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Entities;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.Services;

public class TemperatureLogService : ITemperatureLogService
{
    private static readonly string[] TemperatureManagementRoles = [RoleNames.CompanyOwner, RoleNames.Manager];
    // Setting up monitoring units is an everyday task open to all operational roles (incl. Cashier
    // and SalesAssistant); scheduled-check setup stays manager-only via TemperatureManagementRoles.
    private static readonly string[] TemperatureUnitManagementRoles =
        [RoleNames.CompanyOwner, RoleNames.Manager, RoleNames.Cashier, RoleNames.SalesAssistant];

    private readonly IRepository<TemperatureMonitoringUnit> _unitRepository;
    private readonly IRepository<TemperatureReading> _readingRepository;
    private readonly IRepository<TemperatureDailySignoff> _signoffRepository;
    private readonly IRepository<CfgTemperatureSchedule> _scheduleRepository;
    private readonly IRepository<TemperatureScheduleUnit> _scheduleUnitRepository;
    private readonly IFeatureGateService _featureGateService;
    private readonly IShopMembershipService _shopMembershipService;
    private readonly IAuditService _auditService;
    private readonly ICurrentUserService _currentUserService;
    private readonly IUnitOfWork _unitOfWork;

    public TemperatureLogService(
        IRepository<TemperatureMonitoringUnit> unitRepository,
        IRepository<TemperatureReading> readingRepository,
        IRepository<TemperatureDailySignoff> signoffRepository,
        IRepository<CfgTemperatureSchedule> scheduleRepository,
        IRepository<TemperatureScheduleUnit> scheduleUnitRepository,
        IFeatureGateService featureGateService,
        IShopMembershipService shopMembershipService,
        IAuditService auditService,
        ICurrentUserService currentUserService,
        IUnitOfWork unitOfWork)
    {
        _unitRepository = unitRepository;
        _readingRepository = readingRepository;
        _signoffRepository = signoffRepository;
        _scheduleRepository = scheduleRepository;
        _scheduleUnitRepository = scheduleUnitRepository;
        _featureGateService = featureGateService;
        _shopMembershipService = shopMembershipService;
        _auditService = auditService;
        _currentUserService = currentUserService;
        _unitOfWork = unitOfWork;
    }

    public async Task<IReadOnlyCollection<TemperatureScheduleDto>> ListSchedulesAsync(Guid shopId, CancellationToken cancellationToken = default)
    {
        var rows = await _scheduleRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && !x.IsRandom)
            .OrderBy(x => x.ExpectedTime)
            .ToListAsync(cancellationToken);

        var scheduleIds = rows.Select(x => x.Id).ToList();
        var unitsBySchedule = await LoadUnitIdsByScheduleAsync(scheduleIds, cancellationToken);

        return rows.Select(x => new TemperatureScheduleDto
        {
            Id = x.Id,
            ShopId = x.ShopId,
            UnitIds = unitsBySchedule.TryGetValue(x.Id, out var ids) ? ids : [],
            Label = x.Label,
            ExpectedTime = x.ExpectedTime,
            ToleranceMinutes = x.ToleranceMinutes,
            IsActive = x.IsActive
        }).ToArray();
    }

    public async Task<TemperatureScheduleDto> CreateScheduleAsync(UpsertTemperatureScheduleRequest request, CancellationToken cancellationToken = default)
    {
        await _shopMembershipService.EnsureCurrentUserShopRoleAsync(request.ShopId, TemperatureManagementRoles, cancellationToken);
        await _featureGateService.EnsureFeatureAsync(request.ShopId, FeatureKeys.TemperatureLogScheduledChecks, cancellationToken);
        var unitIds = await ValidateScheduleAsync(request, request.ShopId, cancellationToken);
        var row = new CfgTemperatureSchedule
        {
            ShopId = request.ShopId,
            Label = request.Label.Trim(),
            ExpectedTime = request.ExpectedTime,
            ToleranceMinutes = request.ToleranceMinutes,
            IsActive = request.IsActive,
            CreatedOn = DateTimeOffset.UtcNow,
            CreatedBy = _currentUserService.UserId
        };
        await _scheduleRepository.AddAsync(row, cancellationToken);
        if (unitIds.Count > 0)
        {
            await _scheduleUnitRepository.AddRangeAsync(
                unitIds.Select(uid => new TemperatureScheduleUnit { ScheduleId = row.Id, TemperatureMonitoringUnitId = uid }),
                cancellationToken);
        }
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return await GetScheduleDtoAsync(row.Id, cancellationToken);
    }

    public async Task<TemperatureScheduleDto> UpdateScheduleAsync(Guid id, UpsertTemperatureScheduleRequest request, CancellationToken cancellationToken = default)
    {
        var row = await _scheduleRepository.GetByIdAsync(id, cancellationToken)
            ?? throw new AppException("temperature_schedule_not_found", "Temperature schedule not found.", 404);
        await _shopMembershipService.EnsureCurrentUserShopRoleAsync(row.ShopId, TemperatureManagementRoles, cancellationToken);
        await _featureGateService.EnsureFeatureAsync(row.ShopId, FeatureKeys.TemperatureLogScheduledChecks, cancellationToken);
        // Validate the unit set against the schedule's own shop (not the request's, which the client controls).
        var unitIds = await ValidateScheduleAsync(request, row.ShopId, cancellationToken);
        row.Label = request.Label.Trim();
        row.ExpectedTime = request.ExpectedTime;
        row.ToleranceMinutes = request.ToleranceMinutes;
        row.IsActive = request.IsActive;
        row.ModifiedOn = DateTimeOffset.UtcNow;
        row.ModifiedBy = _currentUserService.UserId;
        _scheduleRepository.Update(row);

        // Sync the join rows to the requested set: drop links no longer wanted, add the new ones.
        var existingLinks = await _scheduleUnitRepository.Query()
            .Where(j => j.ScheduleId == id)
            .ToListAsync(cancellationToken);
        var target = new HashSet<Guid>(unitIds);
        foreach (var link in existingLinks.Where(l => !target.Contains(l.TemperatureMonitoringUnitId)))
        {
            _scheduleUnitRepository.Remove(link);
        }
        var present = existingLinks.Select(l => l.TemperatureMonitoringUnitId).ToHashSet();
        var toAdd = target.Where(uid => !present.Contains(uid))
            .Select(uid => new TemperatureScheduleUnit { ScheduleId = id, TemperatureMonitoringUnitId = uid })
            .ToList();
        if (toAdd.Count > 0)
        {
            await _scheduleUnitRepository.AddRangeAsync(toAdd, cancellationToken);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return await GetScheduleDtoAsync(row.Id, cancellationToken);
    }

    public async Task DeleteScheduleAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var row = await _scheduleRepository.GetByIdAsync(id, cancellationToken)
            ?? throw new AppException("temperature_schedule_not_found", "Temperature schedule not found.", 404);
        await _shopMembershipService.EnsureCurrentUserShopRoleAsync(row.ShopId, TemperatureManagementRoles, cancellationToken);
        await _featureGateService.EnsureFeatureAsync(row.ShopId, FeatureKeys.TemperatureLogScheduledChecks, cancellationToken);
        // Drop link rows explicitly (don't rely solely on the DB cascade, which EF may downgrade).
        var links = await _scheduleUnitRepository.Query()
            .Where(j => j.ScheduleId == id)
            .ToListAsync(cancellationToken);
        foreach (var link in links)
        {
            _scheduleUnitRepository.Remove(link);
        }
        _scheduleRepository.Remove(row);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
    }

    // Validates the request and returns the deduped, shop-verified unit ids for the schedule.
    // An empty result means the schedule applies to ALL units (shop-wide).
    private async Task<IReadOnlyList<Guid>> ValidateScheduleAsync(UpsertTemperatureScheduleRequest request, Guid shopId, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Label))
        {
            throw new AppException("validation_failed", "Schedule label is required.", 400);
        }
        if (request.ToleranceMinutes < 0 || request.ToleranceMinutes > 360)
        {
            throw new AppException("validation_failed", "ToleranceMinutes must be between 0 and 360.", 400);
        }

        var unitIds = (request.UnitIds ?? []).Distinct().ToList();
        if (unitIds.Count == 0)
        {
            return unitIds; // all units
        }

        // Every referenced unit must belong to this shop and not be deleted.
        var validIds = await _unitRepository.Query()
            .AsNoTracking()
            .Where(u => u.ShopId == shopId && !u.IsDeleted && unitIds.Contains(u.Id))
            .Select(u => u.Id)
            .ToListAsync(cancellationToken);
        if (validIds.Count != unitIds.Count)
        {
            throw new AppException("validation_failed", "One or more selected units don't belong to this shop.", 400);
        }
        return unitIds;
    }

    private async Task<TemperatureScheduleDto> GetScheduleDtoAsync(Guid id, CancellationToken cancellationToken)
    {
        var row = await _scheduleRepository.Query().AsNoTracking().FirstAsync(x => x.Id == id, cancellationToken);
        var unitsBySchedule = await LoadUnitIdsByScheduleAsync([id], cancellationToken);
        return new TemperatureScheduleDto
        {
            Id = row.Id,
            ShopId = row.ShopId,
            UnitIds = unitsBySchedule.TryGetValue(row.Id, out var ids) ? ids : [],
            Label = row.Label,
            ExpectedTime = row.ExpectedTime,
            ToleranceMinutes = row.ToleranceMinutes,
            IsActive = row.IsActive
        };
    }

    // Maps each schedule id to its linked unit ids (empty/absent == all units).
    private async Task<Dictionary<Guid, Guid[]>> LoadUnitIdsByScheduleAsync(IReadOnlyCollection<Guid> scheduleIds, CancellationToken cancellationToken)
    {
        if (scheduleIds.Count == 0)
        {
            return new Dictionary<Guid, Guid[]>();
        }
        var links = await _scheduleUnitRepository.Query()
            .AsNoTracking()
            .Where(j => scheduleIds.Contains(j.ScheduleId))
            .Select(j => new { j.ScheduleId, j.TemperatureMonitoringUnitId })
            .ToListAsync(cancellationToken);
        return links
            .GroupBy(j => j.ScheduleId)
            .ToDictionary(g => g.Key, g => g.Select(x => x.TemperatureMonitoringUnitId).ToArray());
    }

    public async Task<IReadOnlyCollection<TemperatureMonitoringUnitDto>> ListUnitsAsync(Guid shopId, CancellationToken cancellationToken = default)
    {
        var units = await _unitRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && !x.IsDeleted)
            .OrderBy(x => x.DisplayOrder)
            .ThenBy(x => x.EquipmentType)
            .ThenBy(x => x.UnitName)
            .ToListAsync(cancellationToken);

        return units.Select(x => x.ToDto()).ToArray();
    }

    public async Task<TemperatureMonitoringUnitDto> CreateUnitAsync(CreateTemperatureMonitoringUnitRequest request, CancellationToken cancellationToken = default)
    {
        ValidateTemperatureRange(request.MinTemperatureCelsius, request.MaxTemperatureCelsius);
        var unitName = request.UnitName.Trim();
        var duplicateName = await _unitRepository.Query().AnyAsync(
            x => x.ShopId == request.ShopId && !x.IsDeleted && x.UnitName == unitName,
            cancellationToken);
        if (duplicateName)
        {
            throw new AppException("temperature_unit_duplicate", "Unit name already exists for this shop.");
        }

        // Honour an explicit order; otherwise drop the unit at the end of the existing list.
        var displayOrder = request.DisplayOrder;
        if (displayOrder <= 0)
        {
            var maxOrder = await _unitRepository.Query()
                .Where(x => x.ShopId == request.ShopId && !x.IsDeleted)
                .Select(x => (int?)x.DisplayOrder)
                .MaxAsync(cancellationToken) ?? 0;
            displayOrder = maxOrder + 1;
        }
        else
        {
            await ResolveDisplayOrderConflictAsync(request.ShopId, displayOrder, null, request.ShiftConflicts, cancellationToken);
        }

        var now = DateTimeOffset.UtcNow;
        var unit = new TemperatureMonitoringUnit
        {
            ShopId = request.ShopId,
            UnitName = unitName,
            EquipmentType = request.EquipmentType,
            MinTemperatureCelsius = request.MinTemperatureCelsius,
            MaxTemperatureCelsius = request.MaxTemperatureCelsius,
            IsActive = request.IsActive,
            Location = request.Location?.Trim(),
            Notes = request.Notes?.Trim(),
            DisplayOrder = displayOrder,
            CreatedOn = now,
            CreatedBy = _currentUserService.UserId
        };

        await _unitRepository.AddAsync(unit, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(
            nameof(TemperatureMonitoringUnit),
            unit.Id,
            "TemperatureUnitCreated",
            unit.ShopId,
            cancellationToken: cancellationToken);

        return unit.ToDto();
    }

    public async Task<TemperatureMonitoringUnitDto> UpdateUnitAsync(Guid id, UpdateTemperatureMonitoringUnitRequest request, CancellationToken cancellationToken = default)
    {
        ValidateTemperatureRange(request.MinTemperatureCelsius, request.MaxTemperatureCelsius);

        var unit = await _unitRepository.Query()
            .FirstOrDefaultAsync(x => x.Id == id && !x.IsDeleted, cancellationToken)
            ?? throw new AppException("temperature_unit_not_found", "Temperature unit not found.", 404);

        await _shopMembershipService.EnsureCurrentUserShopRoleAsync(unit.ShopId, TemperatureUnitManagementRoles, cancellationToken);

        var unitName = request.UnitName.Trim();
        var duplicateName = await _unitRepository.Query().AnyAsync(
            x => x.Id != id && x.ShopId == unit.ShopId && !x.IsDeleted && x.UnitName == unitName,
            cancellationToken);
        if (duplicateName)
        {
            throw new AppException("temperature_unit_duplicate", "Unit name already exists for this shop.");
        }

        await ResolveDisplayOrderConflictAsync(unit.ShopId, request.DisplayOrder, id, request.ShiftConflicts, cancellationToken);

        unit.UnitName = unitName;
        unit.EquipmentType = request.EquipmentType;
        unit.MinTemperatureCelsius = request.MinTemperatureCelsius;
        unit.MaxTemperatureCelsius = request.MaxTemperatureCelsius;
        unit.IsActive = request.IsActive;
        unit.Location = request.Location?.Trim();
        unit.Notes = request.Notes?.Trim();
        unit.DisplayOrder = request.DisplayOrder;
        unit.ModifiedOn = DateTimeOffset.UtcNow;
        unit.ModifiedBy = _currentUserService.UserId;

        _unitRepository.Update(unit);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(
            nameof(TemperatureMonitoringUnit),
            unit.Id,
            "TemperatureUnitUpdated",
            unit.ShopId,
            cancellationToken: cancellationToken);

        return unit.ToDto();
    }

    public async Task ReorderUnitsAsync(ReorderTemperatureUnitsRequest request, CancellationToken cancellationToken = default)
    {
        await _shopMembershipService.EnsureCurrentUserShopRoleAsync(request.ShopId, TemperatureUnitManagementRoles, cancellationToken);

        var items = request.Items ?? Array.Empty<TemperatureUnitOrderItem>();
        if (items.Count == 0)
        {
            return;
        }

        if (items.Any(x => x.DisplayOrder <= 0))
        {
            throw new AppException("invalid_display_order", "Order numbers must be 1 or greater.");
        }

        var duplicate = items.GroupBy(x => x.DisplayOrder).FirstOrDefault(g => g.Count() > 1);
        if (duplicate != null)
        {
            throw new AppException(
                "temperature_unit_order_duplicate",
                $"Order number {duplicate.Key} is used more than once. Give each unit a different number.");
        }

        var orderByUnitId = items.ToDictionary(x => x.UnitId, x => x.DisplayOrder);
        var unitIds = orderByUnitId.Keys.ToList();
        var units = await _unitRepository.Query()
            .Where(x => x.ShopId == request.ShopId && !x.IsDeleted && unitIds.Contains(x.Id))
            .ToListAsync(cancellationToken);

        var now = DateTimeOffset.UtcNow;
        foreach (var unit in units)
        {
            unit.DisplayOrder = orderByUnitId[unit.Id];
            unit.ModifiedOn = now;
            unit.ModifiedBy = _currentUserService.UserId;
            _unitRepository.Update(unit);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);
    }

    public async Task<TemperatureReadingDto> RecordReadingAsync(RecordTemperatureReadingRequest request, CancellationToken cancellationToken = default)
    {
        if (request.ReadingDate == default)
        {
            throw new AppException("temperature_invalid_date", "Reading date is required.");
        }

        var unit = await _unitRepository.Query()
            .AsNoTracking()
            .FirstOrDefaultAsync(
                x => x.Id == request.TemperatureMonitoringUnitId && x.ShopId == request.ShopId && !x.IsDeleted,
                cancellationToken)
            ?? throw new AppException("temperature_unit_not_found", "Temperature unit not found.", 404);

        if (!unit.IsActive)
        {
            throw new AppException("temperature_unit_inactive", "Temperature unit is inactive.");
        }

        var isOutOfRange = request.TemperatureCelsius < unit.MinTemperatureCelsius
            || request.TemperatureCelsius > unit.MaxTemperatureCelsius;
        if (isOutOfRange && string.IsNullOrWhiteSpace(request.ActionTaken) && string.IsNullOrWhiteSpace(request.Notes))
        {
            throw new AppException(ErrorCodes.TemperatureActionRequired, "Action taken or notes are required for out-of-range readings.");
        }

        var now = DateTimeOffset.UtcNow;
        var checkedByInitials = BuildInitials(request.CheckedByInitials, _currentUserService.FullName, _currentUserService.Email);

        // One reading per check per unit per day. When the caller picked a specific check, match on
        // that binding — so logging AM and PM produce two separate readings, and re-logging the same
        // check updates it. Ad-hoc/random entries have no pick, so they stay unique by reading time.
        var existing = request.ScheduleId.HasValue
            ? await _readingRepository.Query().FirstOrDefaultAsync(
                x => x.TemperatureMonitoringUnitId == request.TemperatureMonitoringUnitId
                    && x.ReadingDate == request.ReadingDate
                    && x.ScheduleId == request.ScheduleId,
                cancellationToken)
            : await _readingRepository.Query().FirstOrDefaultAsync(
                x => x.TemperatureMonitoringUnitId == request.TemperatureMonitoringUnitId
                    && x.ReadingDate == request.ReadingDate
                    && x.ReadingTime == request.ReadingTime,
                cancellationToken);

        // Resolve the schedule binding from the caller's pick (a specific slot, or the random bucket
        // when omitted). Outside a real slot's tolerance flags it late; random checks are never late.
        // Recomputed on every save so editing a reading re-evaluates its slot and late flag.
        var (scheduleId, isLate) = await ResolveScheduleAsync(
            request.ShopId,
            request.ScheduleId,
            request.ReadingDate,
            request.ReadingTime,
            cancellationToken);

        var auditAction = "TemperatureReadingRecorded";
        TemperatureReading reading;
        if (existing is null)
        {
            reading = new TemperatureReading
            {
                ShopId = request.ShopId,
                TemperatureMonitoringUnitId = request.TemperatureMonitoringUnitId,
                ReadingDate = request.ReadingDate,
                ReadingTime = request.ReadingTime,
                TemperatureCelsius = request.TemperatureCelsius,
                IsOutOfRange = isOutOfRange,
                CheckedByInitials = checkedByInitials,
                Notes = request.Notes?.Trim(),
                ActionTaken = request.ActionTaken?.Trim(),
                RecordedOn = now,
                RecordedByUserId = _currentUserService.UserId,
                RecordedByName = _currentUserService.FullName,
                ScheduleId = scheduleId,
                IsLateForSchedule = isLate,
                CreatedOn = now,
                CreatedBy = _currentUserService.UserId
            };

            await _readingRepository.AddAsync(reading, cancellationToken);
        }
        else
        {
            existing.TemperatureCelsius = request.TemperatureCelsius;
            existing.IsOutOfRange = isOutOfRange;
            existing.CheckedByInitials = checkedByInitials;
            existing.Notes = request.Notes?.Trim();
            existing.ActionTaken = request.ActionTaken?.Trim();
            existing.RecordedOn = now;
            existing.RecordedByUserId = _currentUserService.UserId;
            existing.RecordedByName = _currentUserService.FullName;
            existing.ScheduleId = scheduleId;
            existing.IsLateForSchedule = isLate;
            existing.ModifiedOn = now;
            existing.ModifiedBy = _currentUserService.UserId;

            reading = existing;
            _readingRepository.Update(existing);
            auditAction = "TemperatureReadingUpdated";
        }

        try
        {
            await _unitOfWork.SaveChangesAsync();
        }
        catch (Exception ex)
        {
            // Surface a clear, actionable message instead of a generic 500 when the write fails
            // (e.g. a transient DB error or a concurrent save of the same check).
            throw new AppException(
                "temperature_save_failed",
                "Couldn't save the temperature reading. Please try again.",
                409);
        }

        await _auditService.LogAsync(
            nameof(TemperatureReading),
            reading.Id,
            auditAction,
            request.ShopId,
            cancellationToken: cancellationToken);

        reading.TemperatureMonitoringUnit = unit;
        return reading.ToDto();
    }

    public async Task<IReadOnlyCollection<TemperatureReadingDto>> ListReadingsAsync(
        Guid shopId,
        DateOnly from,
        DateOnly to,
        Guid? unitId = null,
        CancellationToken cancellationToken = default)
    {
        if (from > to)
        {
            throw new AppException("temperature_invalid_range", "From date cannot be after to date.");
        }

        var query = _readingRepository.Query()
            .AsNoTracking()
            .Include(x => x.TemperatureMonitoringUnit)
            .Where(x => x.ShopId == shopId && x.ReadingDate >= from && x.ReadingDate <= to);

        if (unitId.HasValue)
        {
            query = query.Where(x => x.TemperatureMonitoringUnitId == unitId.Value);
        }

        var readings = await query
            .OrderByDescending(x => x.ReadingDate)
            .ThenByDescending(x => x.ReadingTime)
            .ToListAsync(cancellationToken);

        return readings.Select(x => x.ToDto()).ToArray();
    }

    public async Task<TemperatureDailyLogDto> GetDailyLogAsync(Guid shopId, DateOnly date, CancellationToken cancellationToken = default)
    {
        var units = await _unitRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && x.IsActive && !x.IsDeleted)
            .OrderBy(x => x.DisplayOrder)
            .ThenBy(x => x.EquipmentType)
            .ThenBy(x => x.UnitName)
            .ToListAsync(cancellationToken);

        var readings = await _readingRepository.Query()
            .AsNoTracking()
            .Include(x => x.TemperatureMonitoringUnit)
            .Where(x => x.ShopId == shopId && x.ReadingDate == date)
            .OrderBy(x => x.ReadingTime)
            .ToListAsync(cancellationToken);

        var signoff = await _signoffRepository.Query()
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.ShopId == shopId && x.SignoffDate == date, cancellationToken);

        var readingLookup = readings
            .GroupBy(x => x.TemperatureMonitoringUnitId)
            .ToDictionary(
                x => x.Key,
                x => (IReadOnlyCollection<TemperatureReadingDto>)x.Select(r => r.ToDto()).ToArray());

        return new TemperatureDailyLogDto
        {
            ShopId = shopId,
            Date = date,
            Signoff = signoff?.ToDto(),
            Units = units
                .Select(unit => new TemperatureUnitDailyLogDto
                {
                    Unit = unit.ToDto(),
                    Readings = readingLookup.TryGetValue(unit.Id, out var unitReadings) ? unitReadings : []
                })
                .ToArray()
        };
    }

    public async Task<TemperatureDailySignoffDto> SignOffDailyAsync(SignOffTemperatureDailyLogRequest request, CancellationToken cancellationToken = default)
    {
        if (!_currentUserService.IsOwner() && !_currentUserService.IsInRole(RoleNames.Manager))
        {
            throw new AppException(ErrorCodes.UnauthorizedRole, "Only manager or company owner can sign off daily temperature logs.", 403);
        }

        var readings = await _readingRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == request.ShopId && x.ReadingDate == request.SignoffDate)
            .ToListAsync(cancellationToken);

        if (readings.Count == 0)
        {
            throw new AppException("temperature_no_readings", "At least one reading is required before signoff.");
        }

        var hasOutOfRangeWithoutAction = readings.Any(x =>
            x.IsOutOfRange && string.IsNullOrWhiteSpace(x.ActionTaken) && string.IsNullOrWhiteSpace(x.Notes));
        if (hasOutOfRangeWithoutAction)
        {
            throw new AppException(ErrorCodes.TemperatureActionRequired, "Out-of-range entries require action or notes before signoff.");
        }

        var now = DateTimeOffset.UtcNow;
        var signedByUserId = _currentUserService.UserId
            ?? throw new AppException("unauthorized", "Signed-in user is required.");
        var initials = BuildInitials(request.SignedByInitials, _currentUserService.FullName, _currentUserService.Email);

        var existing = await _signoffRepository.Query()
            .FirstOrDefaultAsync(x => x.ShopId == request.ShopId && x.SignoffDate == request.SignoffDate, cancellationToken);

        TemperatureDailySignoff signoff;
        var auditAction = "TemperatureDailySignedOff";
        if (existing is null)
        {
            signoff = new TemperatureDailySignoff
            {
                ShopId = request.ShopId,
                SignoffDate = request.SignoffDate,
                SignedByUserId = signedByUserId,
                SignedByInitials = initials,
                SignedByName = _currentUserService.FullName,
                SignedOn = now,
                Notes = request.Notes?.Trim(),
                CreatedOn = now,
                CreatedBy = signedByUserId
            };

            await _signoffRepository.AddAsync(signoff, cancellationToken);
        }
        else
        {
            existing.SignedByUserId = signedByUserId;
            existing.SignedByInitials = initials;
            existing.SignedByName = _currentUserService.FullName;
            existing.SignedOn = now;
            existing.Notes = request.Notes?.Trim();
            existing.ModifiedOn = now;
            existing.ModifiedBy = signedByUserId;

            signoff = existing;
            _signoffRepository.Update(existing);
            auditAction = "TemperatureDailySignoffUpdated";
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(
            nameof(TemperatureDailySignoff),
            signoff.Id,
            auditAction,
            request.ShopId,
            cancellationToken: cancellationToken);

        return signoff.ToDto();
    }

    /// <summary>
    /// Resolves the schedule a new reading binds to and whether it counts as late.
    /// When <paramref name="explicitScheduleId"/> names a real scheduled slot the reading binds to
    /// it and is flagged late if logged outside the slot's tolerance window. When it's omitted, or
    /// names the shop's random bucket, the reading is an ad-hoc/extra check: it binds to the shop's
    /// single random-check schedule (created on demand) and is never late. Either way every reading
    /// is stored against some schedule row.
    /// </summary>
    private async Task<(Guid? ScheduleId, bool IsLate)> ResolveScheduleAsync(
        Guid shopId,
        Guid? explicitScheduleId,
        DateOnly readingDate,
        TimeOnly readingTime,
        CancellationToken cancellationToken)
    {
        if (explicitScheduleId.HasValue)
        {
            var picked = await _scheduleRepository.Query()
                .AsNoTracking()
                .FirstOrDefaultAsync(x => x.Id == explicitScheduleId.Value && x.ShopId == shopId, cancellationToken)
                ?? throw new AppException("temperature_schedule_not_found", "Selected temperature schedule not found.", 404);
            if (!picked.IsRandom)
            {
                // Late only applies to today or past days. A reading dated in the future can't be
                // late — its scheduled time hasn't arrived — so don't flag it.
                var isFuture = readingDate > DateOnly.FromDateTime(DateTime.UtcNow);
                // Late strictly means after expected + tolerance; an early reading is not late.
                var isLate = !isFuture && TemperatureScheduleWindows.IsLate(picked, readingTime);
                return (picked.Id, isLate);
            }
        }

        // No specific check chosen (or the random bucket chosen explicitly) → ad-hoc/extra check.
        var randomScheduleId = await EnsureRandomScheduleAsync(shopId, cancellationToken);
        return (randomScheduleId, false);
    }

    /// <summary>
    /// Returns the id of the shop's single random-check bucket schedule, creating it the first time
    /// it's needed. A filtered unique index keeps it one-per-shop; on a concurrent create the loser's
    /// insert violates that index, so we swallow it and re-read the winner's row.
    /// </summary>
    private async Task<Guid> EnsureRandomScheduleAsync(Guid shopId, CancellationToken cancellationToken)
    {
        var existing = await _scheduleRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && x.IsRandom)
            .Select(x => (Guid?)x.Id)
            .FirstOrDefaultAsync(cancellationToken);
        if (existing.HasValue)
        {
            return existing.Value;
        }

        var row = new CfgTemperatureSchedule
        {
            ShopId = shopId,
            Label = "Random",
            ExpectedTime = new TimeOnly(0, 0),
            ToleranceMinutes = 0,
            IsRandom = true,
            IsActive = true,
            CreatedOn = DateTimeOffset.UtcNow,
            CreatedBy = _currentUserService.UserId
        };

        try
        {
            await _scheduleRepository.AddAsync(row, cancellationToken);
            await _unitOfWork.SaveChangesAsync(cancellationToken);
            return row.Id;
        }
        catch (DbUpdateException)
        {
            var winner = await _scheduleRepository.Query()
                .AsNoTracking()
                .Where(x => x.ShopId == shopId && x.IsRandom)
                .Select(x => (Guid?)x.Id)
                .FirstOrDefaultAsync(cancellationToken);
            if (winner.HasValue)
            {
                return winner.Value;
            }
            throw;
        }
    }

    private static void ValidateTemperatureRange(decimal minTemperatureCelsius, decimal maxTemperatureCelsius)
    {
        if (minTemperatureCelsius >= maxTemperatureCelsius)
        {
            throw new AppException("temperature_invalid_range", "Minimum temperature must be lower than maximum temperature.");
        }
    }

    // Order numbers are unique within a shop (0 = "unset", not enforced). On a clash we either reject
    // or, when shiftConflicts is set, bump the unit at that slot and everything below it down by one
    // to make room. Shifted entities are tracked and persisted by the caller's SaveChanges.
    private async Task ResolveDisplayOrderConflictAsync(
        Guid shopId,
        int displayOrder,
        Guid? excludeUnitId,
        bool shiftConflicts,
        CancellationToken cancellationToken)
    {
        if (displayOrder <= 0)
        {
            return;
        }

        var conflicting = await _unitRepository.Query()
            .Where(x => x.ShopId == shopId
                && !x.IsDeleted
                && x.DisplayOrder == displayOrder
                && (excludeUnitId == null || x.Id != excludeUnitId))
            .ToListAsync(cancellationToken);

        if (conflicting.Count == 0)
        {
            return;
        }

        if (!shiftConflicts)
        {
            throw new AppException(
                "temperature_unit_order_duplicate",
                $"Order number {displayOrder} is already used by \"{conflicting[0].UnitName}\". Choose a different number.");
        }

        // Insert at this slot: shift the occupant and everything at/after it down by one. Descending
        // order avoids transient collisions if a unique index is added later.
        var toShift = await _unitRepository.Query()
            .Where(x => x.ShopId == shopId
                && !x.IsDeleted
                && x.DisplayOrder >= displayOrder
                && (excludeUnitId == null || x.Id != excludeUnitId))
            .OrderByDescending(x => x.DisplayOrder)
            .ToListAsync(cancellationToken);

        foreach (var unit in toShift)
        {
            unit.DisplayOrder += 1;
            unit.ModifiedOn = DateTimeOffset.UtcNow;
            unit.ModifiedBy = _currentUserService.UserId;
            _unitRepository.Update(unit);
        }
    }

    private static string BuildInitials(string? preferredInitials, string fullName, string email)
    {
        var preferred = NormalizeInitials(preferredInitials);
        if (!string.IsNullOrWhiteSpace(preferred))
        {
            return preferred;
        }

        var initialsFromName = string.Concat(
            fullName
                .Split(' ', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
                .Select(x => x[0]));
        var fromName = NormalizeInitials(initialsFromName);
        if (!string.IsNullOrWhiteSpace(fromName))
        {
            return fromName;
        }

        if (!string.IsNullOrWhiteSpace(email))
        {
            return NormalizeInitials(email[..1]);
        }

        return "NA";
    }

    private static string NormalizeInitials(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var cleaned = new string(value.Where(char.IsLetterOrDigit).ToArray()).ToUpperInvariant();
        if (cleaned.Length <= 20)
        {
            return cleaned;
        }

        return cleaned[..20];
    }
}




