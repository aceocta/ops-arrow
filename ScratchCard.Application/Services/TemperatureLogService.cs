using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.TemperatureLogs;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Entities;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.Services;

public class TemperatureLogService : ITemperatureLogService
{
    private readonly IRepository<TemperatureMonitoringUnit> _unitRepository;
    private readonly IRepository<TemperatureReading> _readingRepository;
    private readonly IRepository<TemperatureDailySignoff> _signoffRepository;
    private readonly IAuditService _auditService;
    private readonly ICurrentUserService _currentUserService;
    private readonly IUnitOfWork _unitOfWork;

    public TemperatureLogService(
        IRepository<TemperatureMonitoringUnit> unitRepository,
        IRepository<TemperatureReading> readingRepository,
        IRepository<TemperatureDailySignoff> signoffRepository,
        IAuditService auditService,
        ICurrentUserService currentUserService,
        IUnitOfWork unitOfWork)
    {
        _unitRepository = unitRepository;
        _readingRepository = readingRepository;
        _signoffRepository = signoffRepository;
        _auditService = auditService;
        _currentUserService = currentUserService;
        _unitOfWork = unitOfWork;
    }

    public async Task<IReadOnlyCollection<TemperatureMonitoringUnitDto>> ListUnitsAsync(Guid shopId, CancellationToken cancellationToken = default)
    {
        await EnsureDefaultUnitsAsync(shopId, cancellationToken);

        var units = await _unitRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && !x.IsDeleted)
            .OrderBy(x => x.EquipmentType)
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

        var unitName = request.UnitName.Trim();
        var duplicateName = await _unitRepository.Query().AnyAsync(
            x => x.Id != id && x.ShopId == unit.ShopId && !x.IsDeleted && x.UnitName == unitName,
            cancellationToken);
        if (duplicateName)
        {
            throw new AppException("temperature_unit_duplicate", "Unit name already exists for this shop.");
        }

        unit.UnitName = unitName;
        unit.EquipmentType = request.EquipmentType;
        unit.MinTemperatureCelsius = request.MinTemperatureCelsius;
        unit.MaxTemperatureCelsius = request.MaxTemperatureCelsius;
        unit.IsActive = request.IsActive;
        unit.Location = request.Location?.Trim();
        unit.Notes = request.Notes?.Trim();
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
        var existing = await _readingRepository.Query()
            .FirstOrDefaultAsync(
                x => x.TemperatureMonitoringUnitId == request.TemperatureMonitoringUnitId
                    && x.ReadingDate == request.ReadingDate
                    && x.ReadingTime == request.ReadingTime,
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
            existing.ModifiedOn = now;
            existing.ModifiedBy = _currentUserService.UserId;

            reading = existing;
            _readingRepository.Update(existing);
            auditAction = "TemperatureReadingUpdated";
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);

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
        await EnsureDefaultUnitsAsync(shopId, cancellationToken);

        var units = await _unitRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && x.IsActive && !x.IsDeleted)
            .OrderBy(x => x.EquipmentType)
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
        if (!_currentUserService.IsInRole(RoleNames.ShopOwner) && !_currentUserService.IsInRole(RoleNames.Manager))
        {
            throw new AppException(ErrorCodes.UnauthorizedRole, "Only manager or shop owner can sign off daily temperature logs.", 403);
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

    private static void ValidateTemperatureRange(decimal minTemperatureCelsius, decimal maxTemperatureCelsius)
    {
        if (minTemperatureCelsius >= maxTemperatureCelsius)
        {
            throw new AppException("temperature_invalid_range", "Minimum temperature must be lower than maximum temperature.");
        }
    }

    private async Task EnsureDefaultUnitsAsync(Guid shopId, CancellationToken cancellationToken)
    {
        var hasUnits = await _unitRepository.Query()
            .AsNoTracking()
            .AnyAsync(x => x.ShopId == shopId && !x.IsDeleted, cancellationToken);
        if (hasUnits)
        {
            return;
        }

        var now = DateTimeOffset.UtcNow;
        var createdBy = _currentUserService.UserId;
        var defaults = new[]
        {
            new TemperatureMonitoringUnit
            {
                ShopId = shopId,
                UnitName = "Fridge",
                EquipmentType = TemperatureEquipmentType.Fridge,
                MinTemperatureCelsius = 0,
                MaxTemperatureCelsius = 5,
                IsActive = true,
                CreatedOn = now,
                CreatedBy = createdBy
            },
            new TemperatureMonitoringUnit
            {
                ShopId = shopId,
                UnitName = "Freezer",
                EquipmentType = TemperatureEquipmentType.Freezer,
                MinTemperatureCelsius = -25,
                MaxTemperatureCelsius = -15,
                IsActive = true,
                CreatedOn = now,
                CreatedBy = createdBy
            }
        };

        await _unitRepository.AddRangeAsync(defaults, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
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
