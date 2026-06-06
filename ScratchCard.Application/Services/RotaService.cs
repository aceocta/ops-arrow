using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Rota;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Entities;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.Services;

public class RotaService : IRotaService
{
    private static readonly string[] ManagementRoles = [RoleNames.CompanyOwner, RoleNames.Manager];
    private static readonly string[] StaffRoles =
        [RoleNames.CompanyOwner, RoleNames.Manager, RoleNames.Cashier, RoleNames.SalesAssistant];

    private readonly IRepository<RotaShift> _shiftRepository;
    private readonly IRepository<ShiftAssignment> _assignmentRepository;
    private readonly IRepository<ShiftAttendance> _attendanceRepository;
    private readonly IRepository<ShopUser> _shopUserRepository;
    private readonly IRepository<BusinessDay> _businessDayRepository;
    private readonly IShopMembershipService _shopMembershipService;
    private readonly IShopConfigurationService _shopConfigurationService;
    private readonly ICurrentUserService _currentUserService;
    private readonly IUnitOfWork _unitOfWork;

    public RotaService(
        IRepository<RotaShift> shiftRepository,
        IRepository<ShiftAssignment> assignmentRepository,
        IRepository<ShiftAttendance> attendanceRepository,
        IRepository<ShopUser> shopUserRepository,
        IRepository<BusinessDay> businessDayRepository,
        IShopMembershipService shopMembershipService,
        IShopConfigurationService shopConfigurationService,
        ICurrentUserService currentUserService,
        IUnitOfWork unitOfWork)
    {
        _shiftRepository = shiftRepository;
        _assignmentRepository = assignmentRepository;
        _attendanceRepository = attendanceRepository;
        _shopUserRepository = shopUserRepository;
        _businessDayRepository = businessDayRepository;
        _shopMembershipService = shopMembershipService;
        _shopConfigurationService = shopConfigurationService;
        _currentUserService = currentUserService;
        _unitOfWork = unitOfWork;
    }

    // Resolve an active configured shift template for the shop (or throw with a clear message).
    private async Task<Common.Models.ShopShiftTemplate> ResolveTemplateAsync(Guid shopId, string templateId, CancellationToken cancellationToken)
    {
        var setup = await _shopConfigurationService.GetShiftSetupAsync(shopId, cancellationToken);
        var template = setup.ShiftTemplates.FirstOrDefault(t =>
            t.IsActive && string.Equals(t.TemplateId, templateId, StringComparison.OrdinalIgnoreCase));
        return template
            ?? throw new AppException("rota_template_not_found", "Pick a shift from your shop's configured shifts.");
    }

    private Guid CurrentUserId =>
        _currentUserService.UserId ?? throw new AppException("unauthorized", "No authenticated user.", 401);

    private static string FullName(User user) => $"{user.FirstName} {user.LastName}".Trim();

    // The shop's business day for a calendar date, if one exists (null when not yet opened).
    private Task<Guid?> ResolveBusinessDayIdAsync(Guid shopId, DateOnly date, CancellationToken cancellationToken) =>
        _businessDayRepository.Query()
            .Where(x => x.ShopId == shopId && x.BusinessDate == date)
            .Select(x => (Guid?)x.Id)
            .FirstOrDefaultAsync(cancellationToken);

    private static RotaShiftDto MapShift(RotaShift shift) => new()
    {
        Id = shift.Id,
        ShopId = shift.ShopId,
        ShiftDate = shift.ShiftDate,
        BusinessDayId = shift.BusinessDayId,
        ShiftTemplateId = shift.ShiftTemplateId,
        ShiftName = shift.ShiftName,
        StartTime = shift.StartTime,
        EndTime = shift.EndTime,
        Position = shift.Position,
        Notes = shift.Notes,
        Assignees = shift.Assignments
            .OrderBy(a => a.User.FirstName)
            .Select(a => new RotaAssigneeDto { UserId = a.UserId, Name = FullName(a.User) })
            .ToArray(),
    };

    public async Task<IReadOnlyCollection<RotaShiftDto>> GetRotaAsync(Guid shopId, DateOnly from, DateOnly to, CancellationToken cancellationToken = default)
    {
        await _shopMembershipService.EnsureCurrentUserShopRoleAsync(shopId, ManagementRoles, cancellationToken);
        var shifts = await _shiftRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && !x.IsDeleted && x.ShiftDate >= from && x.ShiftDate <= to)
            .Include(x => x.Assignments).ThenInclude(a => a.User)
            .OrderBy(x => x.ShiftDate).ThenBy(x => x.StartTime)
            .ToListAsync(cancellationToken);
        return shifts.Select(MapShift).ToArray();
    }

    public async Task<RotaShiftDto> CreateShiftAsync(CreateRotaShiftRequest request, CancellationToken cancellationToken = default)
    {
        await _shopMembershipService.EnsureCurrentUserShopRoleAsync(request.ShopId, ManagementRoles, cancellationToken);
        var template = await ResolveTemplateAsync(request.ShopId, request.ShiftTemplateId, cancellationToken);

        var now = DateTimeOffset.UtcNow;
        var shift = new RotaShift
        {
            ShopId = request.ShopId,
            ShiftDate = request.ShiftDate,
            BusinessDayId = await ResolveBusinessDayIdAsync(request.ShopId, request.ShiftDate, cancellationToken),
            ShiftTemplateId = template.TemplateId,
            ShiftName = template.Name,
            StartTime = TimeOnly.FromTimeSpan(template.StartTime),
            EndTime = TimeOnly.FromTimeSpan(template.EndTime),
            Position = string.IsNullOrWhiteSpace(request.Position) ? null : request.Position.Trim(),
            Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim(),
            CreatedOn = now,
            CreatedBy = _currentUserService.UserId,
        };
        await _shiftRepository.AddAsync(shift, cancellationToken);

        foreach (var userId in request.AssigneeUserIds.Distinct())
        {
            await _assignmentRepository.AddAsync(new ShiftAssignment
            {
                RotaShiftId = shift.Id,
                ShopId = request.ShopId,
                UserId = userId,
                CreatedOn = now,
                CreatedBy = _currentUserService.UserId,
            }, cancellationToken);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return await GetShiftByIdAsync(shift.Id, cancellationToken);
    }

    public async Task<RotaShiftDto> UpdateShiftAsync(Guid shiftId, UpdateRotaShiftRequest request, CancellationToken cancellationToken = default)
    {
        var shift = await _shiftRepository.Query()
            .Include(x => x.Assignments)
            .FirstOrDefaultAsync(x => x.Id == shiftId && !x.IsDeleted, cancellationToken)
            ?? throw new AppException("rota_shift_not_found", "Shift not found.", 404);

        await _shopMembershipService.EnsureCurrentUserShopRoleAsync(shift.ShopId, ManagementRoles, cancellationToken);
        var template = await ResolveTemplateAsync(shift.ShopId, request.ShiftTemplateId, cancellationToken);

        var now = DateTimeOffset.UtcNow;
        shift.ShiftDate = request.ShiftDate;
        shift.BusinessDayId = await ResolveBusinessDayIdAsync(shift.ShopId, request.ShiftDate, cancellationToken);
        shift.ShiftTemplateId = template.TemplateId;
        shift.ShiftName = template.Name;
        shift.StartTime = TimeOnly.FromTimeSpan(template.StartTime);
        shift.EndTime = TimeOnly.FromTimeSpan(template.EndTime);
        shift.Position = string.IsNullOrWhiteSpace(request.Position) ? null : request.Position.Trim();
        shift.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
        shift.ModifiedOn = now;
        shift.ModifiedBy = _currentUserService.UserId;
        _shiftRepository.Update(shift);

        var desired = request.AssigneeUserIds.Distinct().ToHashSet();
        var current = shift.Assignments.ToList();
        foreach (var existing in current.Where(a => !desired.Contains(a.UserId)))
        {
            _assignmentRepository.Remove(existing);
        }
        var currentIds = current.Select(a => a.UserId).ToHashSet();
        foreach (var userId in desired.Where(id => !currentIds.Contains(id)))
        {
            await _assignmentRepository.AddAsync(new ShiftAssignment
            {
                RotaShiftId = shift.Id,
                ShopId = shift.ShopId,
                UserId = userId,
                CreatedOn = now,
                CreatedBy = _currentUserService.UserId,
            }, cancellationToken);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return await GetShiftByIdAsync(shift.Id, cancellationToken);
    }

    public async Task DeleteShiftAsync(Guid shiftId, CancellationToken cancellationToken = default)
    {
        var shift = await _shiftRepository.Query()
            .Include(x => x.Assignments)
            .FirstOrDefaultAsync(x => x.Id == shiftId && !x.IsDeleted, cancellationToken)
            ?? throw new AppException("rota_shift_not_found", "Shift not found.", 404);

        await _shopMembershipService.EnsureCurrentUserShopRoleAsync(shift.ShopId, ManagementRoles, cancellationToken);
        foreach (var assignment in shift.Assignments.ToList())
        {
            _assignmentRepository.Remove(assignment);
        }
        shift.IsDeleted = true;
        shift.ModifiedOn = DateTimeOffset.UtcNow;
        shift.ModifiedBy = _currentUserService.UserId;
        _shiftRepository.Update(shift);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
    }

    public async Task<IReadOnlyCollection<AssignableUserDto>> GetAssignableUsersAsync(Guid shopId, CancellationToken cancellationToken = default)
    {
        await _shopMembershipService.EnsureCurrentUserShopRoleAsync(shopId, ManagementRoles, cancellationToken);
        var members = await _shopUserRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && x.IsActive)
            .Select(x => new { x.UserId, x.User.FirstName, x.User.LastName, RoleName = x.Role.Name })
            .ToListAsync(cancellationToken);
        return members
            .Select(m => new AssignableUserDto
            {
                UserId = m.UserId,
                Name = $"{m.FirstName} {m.LastName}".Trim(),
                Role = m.RoleName,
            })
            .OrderBy(m => m.Name)
            .ToArray();
    }

    public async Task<IReadOnlyCollection<RotaShiftTemplateDto>> GetShiftTemplatesAsync(Guid shopId, CancellationToken cancellationToken = default)
    {
        await _shopMembershipService.EnsureCurrentUserShopRoleAsync(shopId, ManagementRoles, cancellationToken);
        var setup = await _shopConfigurationService.GetShiftSetupAsync(shopId, cancellationToken);
        return setup.ShiftTemplates
            .Where(t => t.IsActive)
            .Select(t => new RotaShiftTemplateDto
            {
                TemplateId = t.TemplateId,
                Name = t.Name,
                StartTime = TimeOnly.FromTimeSpan(t.StartTime),
                EndTime = TimeOnly.FromTimeSpan(t.EndTime),
            })
            .ToArray();
    }

    public async Task<IReadOnlyCollection<TimesheetRowDto>> GetTimesheetAsync(Guid shopId, DateOnly from, DateOnly to, CancellationToken cancellationToken = default)
    {
        await _shopMembershipService.EnsureCurrentUserShopRoleAsync(shopId, ManagementRoles, cancellationToken);
        var fromBound = new DateTimeOffset(from.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        var toExclusive = new DateTimeOffset(to.AddDays(1).ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);

        var rows = await _attendanceRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && x.CheckInAt >= fromBound && x.CheckInAt < toExclusive)
            .Select(x => new
            {
                x.UserId,
                x.User.FirstName,
                x.User.LastName,
                x.CheckInAt,
                x.CheckOutAt,
            })
            .ToListAsync(cancellationToken);

        return rows
            .GroupBy(x => new { x.UserId, Name = $"{x.FirstName} {x.LastName}" })
            .Select(g => new TimesheetRowDto
            {
                UserId = g.Key.UserId,
                UserName = g.Key.Name.Trim(),
                ShiftsWorked = g.Count(x => x.CheckOutAt != null),
                OpenSessions = g.Count(x => x.CheckOutAt == null),
                TotalHours = Math.Round(
                    (decimal)g.Where(x => x.CheckOutAt != null).Sum(x => (x.CheckOutAt!.Value - x.CheckInAt).TotalHours),
                    2),
            })
            .OrderBy(x => x.UserName)
            .ToArray();
    }

    public async Task<BusinessDayStaffDto> GetBusinessDayStaffAsync(Guid shopId, DateOnly date, CancellationToken cancellationToken = default)
    {
        await _shopMembershipService.EnsureCurrentUserShopRoleAsync(shopId, StaffRoles, cancellationToken);

        var day = await _businessDayRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && x.BusinessDate == date)
            .Select(x => new { x.Id, x.Status })
            .FirstOrDefaultAsync(cancellationToken);

        // Rostered: assignees of this date's shifts (their shift name + times).
        var shifts = await _shiftRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && !x.IsDeleted && x.ShiftDate == date)
            .Include(x => x.Assignments).ThenInclude(a => a.User)
            .ToListAsync(cancellationToken);

        // Attendance for the day — by the linked business day if present, else by calendar date.
        var fromBound = new DateTimeOffset(date.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        var toExclusive = new DateTimeOffset(date.AddDays(1).ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        var attendance = await _attendanceRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId
                && (day != null && x.BusinessDayId == day.Id || x.CheckInAt >= fromBound && x.CheckInAt < toExclusive))
            .Select(x => new
            {
                x.UserId,
                x.User.FirstName,
                x.User.LastName,
                x.CheckInAt,
                x.CheckOutAt,
            })
            .ToListAsync(cancellationToken);

        var rows = new Dictionary<Guid, BusinessDayStaffRowDto>();

        foreach (var shift in shifts)
        {
            foreach (var a in shift.Assignments)
            {
                if (!rows.TryGetValue(a.UserId, out var row))
                {
                    row = new BusinessDayStaffRowDto { UserId = a.UserId, UserName = FullName(a.User) };
                    rows[a.UserId] = row;
                }
                // Keep the earliest-starting rostered shift as the displayed one.
                if (row.StartTime is null || shift.StartTime < row.StartTime)
                {
                    row.ShiftName = shift.ShiftName;
                    row.StartTime = shift.StartTime;
                    row.EndTime = shift.EndTime;
                }
            }
        }

        foreach (var group in attendance.GroupBy(x => new { x.UserId, Name = $"{x.FirstName} {x.LastName}" }))
        {
            if (!rows.TryGetValue(group.Key.UserId, out var row))
            {
                row = new BusinessDayStaffRowDto { UserId = group.Key.UserId, UserName = group.Key.Name.Trim() };
                rows[group.Key.UserId] = row;
            }
            row.CheckInAt = group.Min(x => x.CheckInAt);
            var hasOpen = group.Any(x => x.CheckOutAt == null);
            row.CheckOutAt = hasOpen ? null : group.Max(x => x.CheckOutAt);
            row.Hours = Math.Round(
                (decimal)group.Where(x => x.CheckOutAt != null).Sum(x => (x.CheckOutAt!.Value - x.CheckInAt).TotalHours),
                2);
            var rostered = row.StartTime is not null;
            row.Status = hasOpen ? "OnShift" : rostered ? "Completed" : "Unplanned";
        }

        var ordered = rows.Values.OrderBy(r => r.UserName).ToArray();
        return new BusinessDayStaffDto
        {
            Date = date,
            DayStatus = day?.Status.ToString() ?? "NotStarted",
            TotalHours = Math.Round(ordered.Sum(r => r.Hours), 2),
            OnShiftCount = ordered.Count(r => r.Status == "OnShift"),
            Rows = ordered,
        };
    }

    public async Task<IReadOnlyCollection<RotaShiftDto>> GetMyShiftsAsync(Guid shopId, DateOnly from, DateOnly to, CancellationToken cancellationToken = default)
    {
        await _shopMembershipService.EnsureCurrentUserShopRoleAsync(shopId, StaffRoles, cancellationToken);
        var userId = CurrentUserId;
        var shifts = await _shiftRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && !x.IsDeleted && x.ShiftDate >= from && x.ShiftDate <= to
                && x.Assignments.Any(a => a.UserId == userId))
            .Include(x => x.Assignments).ThenInclude(a => a.User)
            .OrderBy(x => x.ShiftDate).ThenBy(x => x.StartTime)
            .ToListAsync(cancellationToken);

        var shiftIds = shifts.Select(s => s.Id).ToList();
        var attendance = await _attendanceRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && x.UserId == userId && x.RotaShiftId != null && shiftIds.Contains(x.RotaShiftId.Value))
            .ToListAsync(cancellationToken);
        var latestByShift = attendance
            .GroupBy(x => x.RotaShiftId!.Value)
            .ToDictionary(g => g.Key, g => g.OrderByDescending(a => a.CheckInAt).First());

        var name = _currentUserService.FullName;
        return shifts.Select(s =>
        {
            var dto = MapShift(s);
            if (latestByShift.TryGetValue(s.Id, out var att))
            {
                dto.MyAttendance = MapAttendance(att, name);
            }
            return dto;
        }).ToArray();
    }

    public async Task<ShiftAttendanceDto?> GetMyCurrentAttendanceAsync(Guid shopId, CancellationToken cancellationToken = default)
    {
        await _shopMembershipService.EnsureCurrentUserShopRoleAsync(shopId, StaffRoles, cancellationToken);
        var userId = CurrentUserId;
        var open = await _attendanceRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && x.UserId == userId && x.CheckOutAt == null)
            .OrderByDescending(x => x.CheckInAt)
            .FirstOrDefaultAsync(cancellationToken);
        return open is null ? null : MapAttendance(open, _currentUserService.FullName);
    }

    public async Task<ShiftAttendanceDto> CheckInAsync(Guid shopId, Guid? rotaShiftId, CancellationToken cancellationToken = default)
    {
        await _shopMembershipService.EnsureCurrentUserShopRoleAsync(shopId, StaffRoles, cancellationToken);
        var userId = CurrentUserId;

        var alreadyOpen = await _attendanceRepository.Query()
            .AnyAsync(x => x.ShopId == shopId && x.UserId == userId && x.CheckOutAt == null, cancellationToken);
        if (alreadyOpen)
        {
            throw new AppException("rota_already_checked_in", "You're already checked in. Check out first.");
        }

        var now = DateTimeOffset.UtcNow;
        var today = DateOnly.FromDateTime(now.UtcDateTime);

        // Tie to the specified shift (per-shift check-in); else fall back to today's assigned shift.
        Guid? resolvedShiftId = rotaShiftId;
        Guid? shiftBusinessDayId = null;
        if (resolvedShiftId is Guid sid)
        {
            shiftBusinessDayId = await _shiftRepository.Query()
                .Where(x => x.Id == sid && x.ShopId == shopId && !x.IsDeleted)
                .Select(x => x.BusinessDayId)
                .FirstOrDefaultAsync(cancellationToken);
        }
        else
        {
            resolvedShiftId = await _shiftRepository.Query()
                .Where(x => x.ShopId == shopId && !x.IsDeleted && x.ShiftDate == today
                    && x.Assignments.Any(a => a.UserId == userId))
                .OrderBy(x => x.StartTime)
                .Select(x => (Guid?)x.Id)
                .FirstOrDefaultAsync(cancellationToken);
        }

        var businessDayId = shiftBusinessDayId ?? await _businessDayRepository.Query()
            .Where(x => x.ShopId == shopId && x.Status == BusinessDayStatus.Open)
            .OrderByDescending(x => x.BusinessDate)
            .Select(x => (Guid?)x.Id)
            .FirstOrDefaultAsync(cancellationToken);

        var attendance = new ShiftAttendance
        {
            ShopId = shopId,
            UserId = userId,
            BusinessDayId = businessDayId,
            RotaShiftId = resolvedShiftId,
            CheckInAt = now,
            EntryMethod = AttendanceEntryMethod.Clocked,
            IsApproved = true,
            CreatedOn = now,
            CreatedBy = userId,
        };
        await _attendanceRepository.AddAsync(attendance, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return MapAttendance(attendance, _currentUserService.FullName);
    }

    public async Task<ShiftAttendanceDto> CheckOutAsync(Guid shopId, CancellationToken cancellationToken = default)
    {
        await _shopMembershipService.EnsureCurrentUserShopRoleAsync(shopId, StaffRoles, cancellationToken);
        var userId = CurrentUserId;

        var attendance = await _attendanceRepository.Query()
            .Where(x => x.ShopId == shopId && x.UserId == userId && x.CheckOutAt == null)
            .OrderByDescending(x => x.CheckInAt)
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new AppException("rota_not_checked_in", "You're not checked in.");

        var now = DateTimeOffset.UtcNow;
        attendance.CheckOutAt = now;
        attendance.ModifiedOn = now;
        attendance.ModifiedBy = userId;
        _attendanceRepository.Update(attendance);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return MapAttendance(attendance, _currentUserService.FullName);
    }

    private static ShiftAttendanceDto MapAttendance(ShiftAttendance a, string userName) => new()
    {
        Id = a.Id,
        ShopId = a.ShopId,
        UserId = a.UserId,
        UserName = userName,
        RotaShiftId = a.RotaShiftId,
        BusinessDayId = a.BusinessDayId,
        CheckInAt = a.CheckInAt,
        CheckOutAt = a.CheckOutAt,
        EntryMethod = a.EntryMethod.ToString(),
        IsApproved = a.IsApproved,
    };

    public async Task<ShiftAttendanceDto> SaveManualAttendanceAsync(ManualAttendanceRequest request, CancellationToken cancellationToken = default)
    {
        await _shopMembershipService.EnsureCurrentUserShopRoleAsync(request.ShopId, StaffRoles, cancellationToken);
        var userId = CurrentUserId;

        if (request.CheckOutAt is DateTimeOffset outAt && outAt <= request.CheckInAt)
        {
            throw new AppException("rota_invalid_times", "Check-out time must be after check-in time.");
        }

        // Update the user's existing record for this shift if there is one, else create a new manual entry.
        ShiftAttendance? attendance = null;
        if (request.RotaShiftId is Guid sid)
        {
            attendance = await _attendanceRepository.Query()
                .Where(x => x.ShopId == request.ShopId && x.UserId == userId && x.RotaShiftId == sid)
                .OrderByDescending(x => x.CheckInAt)
                .FirstOrDefaultAsync(cancellationToken);
        }

        var now = DateTimeOffset.UtcNow;
        var businessDayId = request.RotaShiftId is Guid shiftId
            ? await _shiftRepository.Query().Where(x => x.Id == shiftId).Select(x => x.BusinessDayId).FirstOrDefaultAsync(cancellationToken)
            : null;

        if (attendance is null)
        {
            attendance = new ShiftAttendance
            {
                ShopId = request.ShopId,
                UserId = userId,
                RotaShiftId = request.RotaShiftId,
                BusinessDayId = businessDayId,
                CreatedOn = now,
                CreatedBy = userId,
            };
            await _attendanceRepository.AddAsync(attendance, cancellationToken);
        }
        else
        {
            attendance.ModifiedOn = now;
            attendance.ModifiedBy = userId;
            _attendanceRepository.Update(attendance);
        }

        attendance.CheckInAt = request.CheckInAt;
        attendance.CheckOutAt = request.CheckOutAt;
        attendance.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
        attendance.EntryMethod = AttendanceEntryMethod.Manual;
        attendance.IsApproved = false; // manual self-entry awaits manager approval
        attendance.ApprovedByUserId = null;
        attendance.ApprovedOn = null;

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return MapAttendance(attendance, _currentUserService.FullName);
    }

    public async Task<IReadOnlyCollection<AttendanceApprovalRowDto>> GetPendingApprovalsAsync(Guid shopId, CancellationToken cancellationToken = default)
    {
        await _shopMembershipService.EnsureCurrentUserShopRoleAsync(shopId, ManagementRoles, cancellationToken);
        var rows = await _attendanceRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && !x.IsApproved)
            .OrderBy(x => x.CheckInAt)
            .Select(x => new
            {
                x.Id,
                x.UserId,
                x.User.FirstName,
                x.User.LastName,
                x.CheckInAt,
                x.CheckOutAt,
                x.Notes,
                x.RotaShiftId,
            })
            .ToListAsync(cancellationToken);

        var shiftIds = rows.Where(r => r.RotaShiftId != null).Select(r => r.RotaShiftId!.Value).Distinct().ToList();
        var shiftInfo = await _shiftRepository.Query()
            .AsNoTracking()
            .Where(x => shiftIds.Contains(x.Id))
            .Select(x => new { x.Id, x.ShiftName, x.ShiftDate })
            .ToDictionaryAsync(x => x.Id, cancellationToken);

        return rows.Select(r => new AttendanceApprovalRowDto
        {
            Id = r.Id,
            UserId = r.UserId,
            UserName = $"{r.FirstName} {r.LastName}".Trim(),
            ShiftName = r.RotaShiftId != null && shiftInfo.TryGetValue(r.RotaShiftId.Value, out var s) ? s.ShiftName : null,
            ShiftDate = r.RotaShiftId != null && shiftInfo.TryGetValue(r.RotaShiftId.Value, out var s2) ? s2.ShiftDate : null,
            CheckInAt = r.CheckInAt,
            CheckOutAt = r.CheckOutAt,
            Notes = r.Notes,
        }).ToArray();
    }

    public async Task<ShiftAttendanceDto> ApproveAttendanceAsync(Guid attendanceId, CancellationToken cancellationToken = default)
    {
        var attendance = await _attendanceRepository.Query()
            .Include(x => x.User)
            .FirstOrDefaultAsync(x => x.Id == attendanceId, cancellationToken)
            ?? throw new AppException("rota_attendance_not_found", "Attendance record not found.", 404);
        await _shopMembershipService.EnsureCurrentUserShopRoleAsync(attendance.ShopId, ManagementRoles, cancellationToken);

        var now = DateTimeOffset.UtcNow;
        attendance.IsApproved = true;
        attendance.ApprovedByUserId = _currentUserService.UserId;
        attendance.ApprovedOn = now;
        attendance.ModifiedOn = now;
        attendance.ModifiedBy = _currentUserService.UserId;
        _attendanceRepository.Update(attendance);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return MapAttendance(attendance, $"{attendance.User.FirstName} {attendance.User.LastName}".Trim());
    }

    public async Task<ShiftAttendanceDto> UpdateAttendanceAsync(Guid attendanceId, UpdateAttendanceRequest request, CancellationToken cancellationToken = default)
    {
        var attendance = await _attendanceRepository.Query()
            .Include(x => x.User)
            .FirstOrDefaultAsync(x => x.Id == attendanceId, cancellationToken)
            ?? throw new AppException("rota_attendance_not_found", "Attendance record not found.", 404);
        await _shopMembershipService.EnsureCurrentUserShopRoleAsync(attendance.ShopId, ManagementRoles, cancellationToken);

        if (request.CheckOutAt is DateTimeOffset outAt && outAt <= request.CheckInAt)
        {
            throw new AppException("rota_invalid_times", "Check-out time must be after check-in time.");
        }

        var now = DateTimeOffset.UtcNow;
        attendance.CheckInAt = request.CheckInAt;
        attendance.CheckOutAt = request.CheckOutAt;
        attendance.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
        attendance.IsApproved = true; // a manager edit is authoritative
        attendance.ApprovedByUserId = _currentUserService.UserId;
        attendance.ApprovedOn = now;
        attendance.ModifiedOn = now;
        attendance.ModifiedBy = _currentUserService.UserId;
        _attendanceRepository.Update(attendance);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return MapAttendance(attendance, $"{attendance.User.FirstName} {attendance.User.LastName}".Trim());
    }

    private async Task<RotaShiftDto> GetShiftByIdAsync(Guid shiftId, CancellationToken cancellationToken)
    {
        var shift = await _shiftRepository.Query()
            .AsNoTracking()
            .Include(x => x.Assignments).ThenInclude(a => a.User)
            .FirstAsync(x => x.Id == shiftId, cancellationToken);
        return MapShift(shift);
    }
}
