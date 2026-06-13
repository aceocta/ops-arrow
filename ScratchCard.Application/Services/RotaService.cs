using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Models;
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
    private readonly IRepository<RotaStaffMember> _staffMemberRepository;
    private readonly IRepository<ShiftAssignment> _assignmentRepository;
    private readonly IRepository<ShiftAttendance> _attendanceRepository;
    private readonly IRepository<StaffPayRate> _payRateRepository;
    private readonly IRepository<RotaTimesheetLock> _timesheetLockRepository;
    private readonly IRepository<RotaTimesheetReview> _timesheetReviewRepository;
    private readonly IRepository<LeaveRequest> _leaveRequestRepository;
    private readonly IRepository<ShopUser> _shopUserRepository;
    private readonly IRepository<BusinessDay> _businessDayRepository;
    private readonly IRepository<UserPushToken> _pushTokenRepository;
    private readonly IShopMembershipService _shopMembershipService;
    private readonly IShopConfigurationService _shopConfigurationService;
    private readonly IFeatureGateService _featureGateService;
    private readonly INotificationService _notificationService;
    private readonly ICurrentUserService _currentUserService;
    private readonly IUnitOfWork _unitOfWork;

    public RotaService(
        IRepository<RotaShift> shiftRepository,
        IRepository<RotaStaffMember> staffMemberRepository,
        IRepository<ShiftAssignment> assignmentRepository,
        IRepository<ShiftAttendance> attendanceRepository,
        IRepository<StaffPayRate> payRateRepository,
        IRepository<RotaTimesheetLock> timesheetLockRepository,
        IRepository<RotaTimesheetReview> timesheetReviewRepository,
        IRepository<LeaveRequest> leaveRequestRepository,
        IRepository<ShopUser> shopUserRepository,
        IRepository<BusinessDay> businessDayRepository,
        IRepository<UserPushToken> pushTokenRepository,
        IShopMembershipService shopMembershipService,
        IShopConfigurationService shopConfigurationService,
        IFeatureGateService featureGateService,
        INotificationService notificationService,
        ICurrentUserService currentUserService,
        IUnitOfWork unitOfWork)
    {
        _shiftRepository = shiftRepository;
        _staffMemberRepository = staffMemberRepository;
        _assignmentRepository = assignmentRepository;
        _attendanceRepository = attendanceRepository;
        _payRateRepository = payRateRepository;
        _timesheetLockRepository = timesheetLockRepository;
        _timesheetReviewRepository = timesheetReviewRepository;
        _leaveRequestRepository = leaveRequestRepository;
        _shopUserRepository = shopUserRepository;
        _businessDayRepository = businessDayRepository;
        _pushTokenRepository = pushTokenRepository;
        _shopMembershipService = shopMembershipService;
        _shopConfigurationService = shopConfigurationService;
        _featureGateService = featureGateService;
        _notificationService = notificationService;
        _currentUserService = currentUserService;
        _unitOfWork = unitOfWork;
    }

    // Role + subscription-feature gates. Management = CompanyOwner/Manager; staff = operational roles.
    private async Task EnsureManageAsync(Guid shopId, CancellationToken ct, string feature = FeatureKeys.StaffRotaBasic)
    {
        await _shopMembershipService.EnsureCurrentUserShopRoleAsync(shopId, ManagementRoles, ct);
        await _featureGateService.EnsureFeatureAsync(shopId, feature, ct);
    }

    private async Task EnsureStaffAsync(Guid shopId, CancellationToken ct, string feature = FeatureKeys.StaffRotaBasic)
    {
        await _shopMembershipService.EnsureCurrentUserShopRoleAsync(shopId, StaffRoles, ct);
        await _featureGateService.EnsureFeatureAsync(shopId, feature, ct);
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

    // A shift whose end time is on or before its start time finishes the next day (overnight).
    private static DateOnly ResolveEndDate(DateOnly shiftDate, TimeOnly start, TimeOnly end) =>
        end <= start ? shiftDate.AddDays(1) : shiftDate;

    // The shop's business day covering a shift that starts at startTime on shiftDate, if one
    // exists (null when not yet opened). Day Management dates an overnight business window
    // (start > end, e.g. 22:00 -> 09:59) by its CLOSE date, so a shift starting after the
    // window's end time belongs to the NEXT calendar date's business day — the inverse of
    // ShiftService.ResolveScheduledShiftDates. Same-day windows keep the shift's start date.
    private async Task<Guid?> ResolveBusinessDayIdAsync(Guid shopId, DateOnly shiftDate, TimeOnly startTime, CancellationToken cancellationToken)
    {
        var setup = await _shopConfigurationService.GetBusinessDaySetupAsync(shopId, cancellationToken);
        var businessDate = setup.BusinessStartTime > setup.BusinessEndTime && startTime.ToTimeSpan() > setup.BusinessEndTime
            ? shiftDate.AddDays(1)
            : shiftDate;
        return await _businessDayRepository.Query()
            .Where(x => x.ShopId == shopId && x.BusinessDate == businessDate)
            .Select(x => (Guid?)x.Id)
            .FirstOrDefaultAsync(cancellationToken);
    }

    private static RotaShiftDto MapShift(RotaShift shift) => new()
    {
        Id = shift.Id,
        ShopId = shift.ShopId,
        ShiftDate = shift.ShiftDate,
        EndDate = shift.EndDate,
        BusinessDayId = shift.BusinessDayId,
        ShiftTemplateId = shift.ShiftTemplateId,
        ShiftName = shift.ShiftName,
        StartTime = shift.StartTime,
        EndTime = shift.EndTime,
        Position = shift.Position,
        Notes = shift.Notes,
        Assignees = shift.Assignments
            .Select(a => new RotaAssigneeDto
            {
                UserId = a.UserId,
                RotaStaffMemberId = a.RotaStaffMemberId,
                Name = a.User != null ? FullName(a.User) : (a.RotaStaffMember != null ? a.RotaStaffMember.Name : "—"),
                Phone = a.User != null ? a.User.PhoneNumber : a.RotaStaffMember != null ? a.RotaStaffMember.Phone : null,
                Email = a.User != null ? a.User.Email : a.RotaStaffMember != null ? a.RotaStaffMember.Email : null,
                IsExternal = a.RotaStaffMemberId != null,
                Reason = a.Reason,
                Note = a.Note,
            })
            .OrderBy(a => a.Name)
            .ToArray(),
    };

    public async Task<IReadOnlyCollection<RotaShiftDto>> GetRotaAsync(Guid shopId, DateOnly from, DateOnly to, CancellationToken cancellationToken = default)
    {
        await EnsureManageAsync(shopId, cancellationToken);
        var shifts = await _shiftRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && !x.IsDeleted && x.ShiftDate >= from && x.ShiftDate <= to)
            .Include(x => x.Assignments).ThenInclude(a => a.User)
            .Include(x => x.Assignments).ThenInclude(a => a.RotaStaffMember)
            .OrderBy(x => x.ShiftDate).ThenBy(x => x.StartTime)
            .ToListAsync(cancellationToken);
        return shifts.Select(MapShift).ToArray();
    }

    private static int Minutes(TimeOnly t) => (t.Hour * 60) + t.Minute;

    // Inclusive day count of the overlap between [start, end] and [from, to] (0 when disjoint).
    private static int OverlapDays(DateOnly start, DateOnly end, DateOnly from, DateOnly to)
    {
        var s = start > from ? start : from;
        var e = end < to ? end : to;
        return e < s ? 0 : e.DayNumber - s.DayNumber + 1;
    }

    // Two shift windows on the same day overlap (overnight windows extend past midnight).
    private static bool Overlaps(TimeOnly aStart, TimeOnly aEnd, TimeOnly bStart, TimeOnly bEnd)
    {
        int aS = Minutes(aStart), aE = Minutes(aEnd); if (aE <= aS) aE += 1440;
        int bS = Minutes(bStart), bE = Minutes(bEnd); if (bE <= bS) bE += 1440;
        return aS < bE && bS < aE;
    }

    // A shop can't have a duplicate (same shift template) on a day, nor double-book the SAME person
    // into overlapping shifts. Overlap between DIFFERENT staff is allowed — e.g. a day shift and an
    // overnight shift that share a handover hour, each reconciling its own till.
    private async Task EnsureNoShiftConflictAsync(
        Guid shopId, DateOnly date, string templateId, TimeOnly start, TimeOnly end,
        IEnumerable<Guid> assigneeUserIds, IEnumerable<Guid> assigneeStaffMemberIds,
        Guid? excludeShiftId, CancellationToken cancellationToken)
    {
        var newUsers = assigneeUserIds.ToHashSet();
        var newMembers = assigneeStaffMemberIds.ToHashSet();

        var sameDay = await _shiftRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && !x.IsDeleted && x.ShiftDate == date && (excludeShiftId == null || x.Id != excludeShiftId))
            .Select(x => new
            {
                x.ShiftTemplateId,
                x.ShiftName,
                x.StartTime,
                x.EndTime,
                UserIds = x.Assignments.Where(a => a.UserId != null).Select(a => a.UserId!.Value).ToList(),
                MemberIds = x.Assignments.Where(a => a.RotaStaffMemberId != null).Select(a => a.RotaStaffMemberId!.Value).ToList(),
            })
            .ToListAsync(cancellationToken);

        if (sameDay.Any(x => string.Equals(x.ShiftTemplateId, templateId, StringComparison.OrdinalIgnoreCase)))
        {
            throw new AppException("rota_duplicate_shift", "That shift is already on the rota for this day.");
        }

        // Only a time overlap that involves the same assignee is a real conflict.
        var clash = sameDay.FirstOrDefault(x =>
            Overlaps(start, end, x.StartTime, x.EndTime) &&
            (x.UserIds.Any(newUsers.Contains) || x.MemberIds.Any(newMembers.Contains)));
        if (clash is not null)
        {
            throw new AppException("rota_overlapping_shift",
                $"This person is already on the {clash.ShiftName} shift ({clash.StartTime:HH:mm}–{clash.EndTime:HH:mm}) on this day.");
        }
    }

    // Someone with approved leave covering the shift date can't be (newly) assigned to it.
    // Callers pass only the people being added — update saves exclude current assignees so a
    // later-approved leave never makes an existing shift uneditable. Single batched query;
    // no feature gate needed (no leave records → no effect).
    private async Task EnsureNoApprovedLeaveAsync(
        Guid shopId, DateOnly shiftDate,
        IReadOnlyCollection<Guid> userIds, IReadOnlyCollection<Guid> rotaStaffMemberIds,
        CancellationToken cancellationToken)
    {
        if (userIds.Count == 0 && rotaStaffMemberIds.Count == 0)
        {
            return;
        }

        var onLeave = await _leaveRequestRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && x.Status == LeaveRequestStatus.Approved
                && x.StartDate <= shiftDate && x.EndDate >= shiftDate
                && ((x.UserId != null && userIds.Contains(x.UserId.Value))
                    || (x.RotaStaffMemberId != null && rotaStaffMemberIds.Contains(x.RotaStaffMemberId.Value))))
            .Select(x => new
            {
                Name = x.User != null
                    ? x.User.FirstName + " " + x.User.LastName
                    : x.RotaStaffMember != null ? x.RotaStaffMember.Name : "This person",
            })
            .FirstOrDefaultAsync(cancellationToken);
        if (onLeave is not null)
        {
            throw new AppException("rota_assignee_on_leave",
                $"{onLeave.Name.Trim()} is on approved leave on {shiftDate:d MMM yyyy} and can't be assigned.", 400);
        }
    }

    // A normalized desired assignee for a create/update save (reason/note already normalized).
    private sealed record DesiredAssignment(Guid? UserId, Guid? RotaStaffMemberId, string? Reason, string? Note);

    // NULL is the default "Regular shift" — only non-regular reasons are stored.
    private static string? NormalizeAssignmentReason(string? reason)
    {
        var trimmed = reason?.Trim();
        if (string.IsNullOrEmpty(trimmed) || string.Equals(trimmed, "Regular shift", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }
        if (trimmed.Length > 100)
        {
            throw new AppException("rota_assignment_reason_too_long", "Keep the assignment reason under 100 characters.");
        }
        return trimmed;
    }

    private static string? NormalizeAssignmentNote(string? note)
    {
        var trimmed = note?.Trim();
        if (string.IsNullOrEmpty(trimmed))
        {
            return null;
        }
        if (trimmed.Length > 300)
        {
            throw new AppException("rota_assignment_note_too_long", "Keep the assignment note under 300 characters.");
        }
        return trimmed;
    }

    // The authoritative assignee list for a save: the explicit Assignments list when provided
    // (carries reason/note), else the legacy AssigneeUserIds/AssigneeStaffMemberIds arrays.
    private static List<DesiredAssignment> ResolveDesiredAssignments(
        IReadOnlyCollection<Guid> assigneeUserIds,
        IReadOnlyCollection<Guid> assigneeStaffMemberIds,
        IReadOnlyCollection<SaveShiftAssignmentRequest>? assignments)
    {
        if (assignments is null)
        {
            return assigneeUserIds.Distinct().Select(id => new DesiredAssignment(id, null, null, null))
                .Concat(assigneeStaffMemberIds.Distinct().Select(id => new DesiredAssignment(null, id, null, null)))
                .ToList();
        }

        var desired = new List<DesiredAssignment>();
        var seen = new HashSet<string>();
        foreach (var assignment in assignments)
        {
            if (assignment.UserId is null == assignment.RotaStaffMemberId is null)
            {
                throw new AppException("rota_assignment_invalid",
                    "Each assignment needs either a user or a roster staff member (not both).");
            }
            // One assignment per person — later duplicates are ignored.
            if (!seen.Add(assignment.UserId != null ? $"u:{assignment.UserId}" : $"m:{assignment.RotaStaffMemberId}"))
            {
                continue;
            }
            desired.Add(new DesiredAssignment(
                assignment.UserId,
                assignment.RotaStaffMemberId,
                NormalizeAssignmentReason(assignment.Reason),
                NormalizeAssignmentNote(assignment.Note)));
        }
        return desired;
    }

    public async Task<RotaShiftDto> CreateShiftAsync(CreateRotaShiftRequest request, CancellationToken cancellationToken = default)
    {
        await EnsureManageAsync(request.ShopId, cancellationToken);
        var template = await ResolveTemplateAsync(request.ShopId, request.ShiftTemplateId, cancellationToken);
        var desired = ResolveDesiredAssignments(request.AssigneeUserIds, request.AssigneeStaffMemberIds, request.Assignments);
        await EnsureNoShiftConflictAsync(request.ShopId, request.ShiftDate, template.TemplateId,
            TimeOnly.FromTimeSpan(template.StartTime), TimeOnly.FromTimeSpan(template.EndTime),
            desired.Where(d => d.UserId != null).Select(d => d.UserId!.Value),
            desired.Where(d => d.RotaStaffMemberId != null).Select(d => d.RotaStaffMemberId!.Value),
            null, cancellationToken);
        await EnsureNoApprovedLeaveAsync(request.ShopId, request.ShiftDate,
            desired.Where(d => d.UserId != null).Select(d => d.UserId!.Value).ToList(),
            desired.Where(d => d.RotaStaffMemberId != null).Select(d => d.RotaStaffMemberId!.Value).ToList(),
            cancellationToken);

        var now = DateTimeOffset.UtcNow;
        var startTime = TimeOnly.FromTimeSpan(template.StartTime);
        var endTime = TimeOnly.FromTimeSpan(template.EndTime);
        var shift = new RotaShift
        {
            ShopId = request.ShopId,
            ShiftDate = request.ShiftDate,
            EndDate = ResolveEndDate(request.ShiftDate, startTime, endTime),
            BusinessDayId = await ResolveBusinessDayIdAsync(request.ShopId, request.ShiftDate, startTime, cancellationToken),
            ShiftTemplateId = template.TemplateId,
            ShiftName = template.Name,
            StartTime = startTime,
            EndTime = endTime,
            Position = string.IsNullOrWhiteSpace(request.Position) ? null : request.Position.Trim(),
            Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim(),
            CreatedOn = now,
            CreatedBy = _currentUserService.UserId,
        };
        await _shiftRepository.AddAsync(shift, cancellationToken);

        foreach (var d in desired)
        {
            await _assignmentRepository.AddAsync(new ShiftAssignment
            {
                RotaShiftId = shift.Id,
                ShopId = request.ShopId,
                UserId = d.UserId,
                RotaStaffMemberId = d.RotaStaffMemberId,
                Reason = d.Reason,
                Note = d.Note,
                CreatedOn = now,
                CreatedBy = _currentUserService.UserId,
            }, cancellationToken);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return await GetShiftByIdAsync(shift.Id, cancellationToken);
    }

    public async Task<IReadOnlyCollection<RotaShiftDto>> GenerateWeekAsync(Guid shopId, DateOnly weekStart, CancellationToken cancellationToken = default)
    {
        await EnsureManageAsync(shopId, cancellationToken);
        var setup = await _shopConfigurationService.GetShiftSetupAsync(shopId, cancellationToken);
        var templates = setup.ShiftTemplates.Where(t => t.IsActive).ToList();
        var weekEnd = weekStart.AddDays(6);
        var now = DateTimeOffset.UtcNow;

        // This week's existing shifts (to avoid duplicating a slot) and last week's shifts with
        // assignees (to copy the recurring staffing pattern forward).
        var existing = await _shiftRepository.Query()
            .Where(x => x.ShopId == shopId && !x.IsDeleted && x.ShiftDate >= weekStart && x.ShiftDate <= weekEnd)
            .Select(x => new { x.ShiftDate, x.ShiftTemplateId })
            .ToListAsync(cancellationToken);
        var existingKeys = existing
            .Select(x => $"{x.ShiftDate:yyyy-MM-dd}|{x.ShiftTemplateId}")
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var prevWeekStart = weekStart.AddDays(-7);
        var prevWeekEnd = weekStart.AddDays(-1);
        var prevShifts = await _shiftRepository.Query()
            .Where(x => x.ShopId == shopId && !x.IsDeleted && x.ShiftDate >= prevWeekStart && x.ShiftDate <= prevWeekEnd)
            .Include(x => x.Assignments)
            .ToListAsync(cancellationToken);
        // Keyed by the matching weekday (date + 7) + template, so we line each day up with last week.
        var prevByKey = prevShifts.ToDictionary(
            x => $"{x.ShiftDate.AddDays(7):yyyy-MM-dd}|{x.ShiftTemplateId}",
            x => x.Assignments.Select(a => (a.UserId, a.RotaStaffMemberId)).ToList(),
            StringComparer.OrdinalIgnoreCase);

        // Approved leave covering the target week — don't copy an assignment onto a day the
        // person is off (leave data only; no LeaveManagement feature coupling).
        var approvedLeave = await _leaveRequestRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && x.Status == LeaveRequestStatus.Approved
                && x.StartDate <= weekEnd && x.EndDate >= weekStart)
            .Select(x => new { x.UserId, x.RotaStaffMemberId, x.StartDate, x.EndDate })
            .ToListAsync(cancellationToken);
        bool OnApprovedLeave(Guid? userId, Guid? memberId, DateOnly date) => approvedLeave.Any(l =>
            l.UserId == userId && l.RotaStaffMemberId == memberId && l.StartDate <= date && l.EndDate >= date);

        var created = new List<Guid>();
        for (var offset = 0; offset < 7; offset++)
        {
            var date = weekStart.AddDays(offset);
            foreach (var template in templates)
            {
                var key = $"{date:yyyy-MM-dd}|{template.TemplateId}";
                if (existingKeys.Contains(key)) continue; // already on the rota

                var startTime = TimeOnly.FromTimeSpan(template.StartTime);
                var endTime = TimeOnly.FromTimeSpan(template.EndTime);
                var shift = new RotaShift
                {
                    ShopId = shopId,
                    ShiftDate = date,
                    EndDate = ResolveEndDate(date, startTime, endTime),
                    BusinessDayId = await ResolveBusinessDayIdAsync(shopId, date, startTime, cancellationToken),
                    ShiftTemplateId = template.TemplateId,
                    ShiftName = template.Name,
                    StartTime = startTime,
                    EndTime = endTime,
                    CreatedOn = now,
                    CreatedBy = _currentUserService.UserId,
                };
                await _shiftRepository.AddAsync(shift, cancellationToken);
                created.Add(shift.Id);

                if (prevByKey.TryGetValue(key, out var assignees))
                {
                    foreach (var (userId, memberId) in assignees)
                    {
                        if (OnApprovedLeave(userId, memberId, date)) continue; // person is on leave that day
                        await _assignmentRepository.AddAsync(new ShiftAssignment
                        {
                            RotaShiftId = shift.Id,
                            ShopId = shopId,
                            UserId = userId,
                            RotaStaffMemberId = memberId,
                            CreatedOn = now,
                            CreatedBy = _currentUserService.UserId,
                        }, cancellationToken);
                    }
                }
            }
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return await GetRotaAsync(shopId, weekStart, weekEnd, cancellationToken);
    }

    public async Task<RotaShiftDto> UpdateShiftAsync(Guid shiftId, UpdateRotaShiftRequest request, CancellationToken cancellationToken = default)
    {
        var shift = await _shiftRepository.Query()
            .Include(x => x.Assignments)
            .FirstOrDefaultAsync(x => x.Id == shiftId && !x.IsDeleted, cancellationToken)
            ?? throw new AppException("rota_shift_not_found", "Shift not found.", 404);

        await EnsureManageAsync(shift.ShopId, cancellationToken);
        var template = await ResolveTemplateAsync(shift.ShopId, request.ShiftTemplateId, cancellationToken);
        var desired = ResolveDesiredAssignments(request.AssigneeUserIds, request.AssigneeStaffMemberIds, request.Assignments);
        await EnsureNoShiftConflictAsync(shift.ShopId, request.ShiftDate, template.TemplateId,
            TimeOnly.FromTimeSpan(template.StartTime), TimeOnly.FromTimeSpan(template.EndTime),
            desired.Where(d => d.UserId != null).Select(d => d.UserId!.Value),
            desired.Where(d => d.RotaStaffMemberId != null).Select(d => d.RotaStaffMemberId!.Value),
            shiftId, cancellationToken);

        // Leave check applies only to NEWLY-ADDED people — an existing assignee whose leave was
        // approved after they were rostered must not make the shift uneditable.
        var assignedUserIds = shift.Assignments.Where(a => a.UserId != null).Select(a => a.UserId!.Value).ToHashSet();
        var assignedMemberIds = shift.Assignments.Where(a => a.RotaStaffMemberId != null).Select(a => a.RotaStaffMemberId!.Value).ToHashSet();
        await EnsureNoApprovedLeaveAsync(shift.ShopId, request.ShiftDate,
            desired.Where(d => d.UserId != null && !assignedUserIds.Contains(d.UserId.Value)).Select(d => d.UserId!.Value).ToList(),
            desired.Where(d => d.RotaStaffMemberId != null && !assignedMemberIds.Contains(d.RotaStaffMemberId.Value)).Select(d => d.RotaStaffMemberId!.Value).ToList(),
            cancellationToken);

        var now = DateTimeOffset.UtcNow;
        shift.ShiftDate = request.ShiftDate;
        shift.StartTime = TimeOnly.FromTimeSpan(template.StartTime);
        shift.EndTime = TimeOnly.FromTimeSpan(template.EndTime);
        shift.EndDate = ResolveEndDate(request.ShiftDate, shift.StartTime, shift.EndTime);
        shift.BusinessDayId = await ResolveBusinessDayIdAsync(shift.ShopId, request.ShiftDate, shift.StartTime, cancellationToken);
        shift.ShiftTemplateId = template.TemplateId;
        shift.ShiftName = template.Name;
        shift.Position = string.IsNullOrWhiteSpace(request.Position) ? null : request.Position.Trim();
        shift.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
        shift.ModifiedOn = now;
        shift.ModifiedBy = _currentUserService.UserId;
        _shiftRepository.Update(shift);

        static string PersonKey(Guid? userId, Guid? memberId) => userId != null ? $"u:{userId}" : $"m:{memberId}";
        var desiredByKey = desired.ToDictionary(d => PersonKey(d.UserId, d.RotaStaffMemberId));
        var current = shift.Assignments.ToList();

        // Remove assignments no longer wanted; sync reason/note on kept ones when the explicit
        // Assignments list was sent (legacy id-array saves never touch stored reasons/notes).
        foreach (var existing in current)
        {
            if (!desiredByKey.TryGetValue(PersonKey(existing.UserId, existing.RotaStaffMemberId), out var d))
            {
                _assignmentRepository.Remove(existing);
            }
            else if (request.Assignments is not null && (existing.Reason != d.Reason || existing.Note != d.Note))
            {
                existing.Reason = d.Reason;
                existing.Note = d.Note;
                existing.ModifiedOn = now;
                existing.ModifiedBy = _currentUserService.UserId;
                _assignmentRepository.Update(existing);
            }
        }

        var currentKeys = current.Select(a => PersonKey(a.UserId, a.RotaStaffMemberId)).ToHashSet();
        foreach (var d in desired.Where(d => !currentKeys.Contains(PersonKey(d.UserId, d.RotaStaffMemberId))))
        {
            await _assignmentRepository.AddAsync(new ShiftAssignment
            {
                RotaShiftId = shift.Id, ShopId = shift.ShopId,
                UserId = d.UserId, RotaStaffMemberId = d.RotaStaffMemberId,
                Reason = d.Reason, Note = d.Note,
                CreatedOn = now, CreatedBy = _currentUserService.UserId,
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

        await EnsureManageAsync(shift.ShopId, cancellationToken);
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
        await EnsureManageAsync(shopId, cancellationToken);
        var members = await _shopUserRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && x.IsActive)
            .Select(x => new { x.UserId, x.User.FirstName, x.User.LastName, RoleName = x.Role.Name })
            .ToListAsync(cancellationToken);
        var users = members
            .Select(m => new AssignableUserDto
            {
                UserId = m.UserId,
                Name = $"{m.FirstName} {m.LastName}".Trim(),
                Role = m.RoleName,
            });

        // Roster-only (external/casual) members — not Ops Arrow users.
        var rosterMembers = await _staffMemberRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && !x.IsDeleted && x.IsActive)
            .Select(x => new AssignableUserDto
            {
                RotaStaffMemberId = x.Id,
                IsExternal = true,
                Name = x.Name,
                Role = "External",
            })
            .ToListAsync(cancellationToken);

        return users.Concat(rosterMembers).OrderBy(m => m.Name).ToArray();
    }

    public async Task<IReadOnlyCollection<RotaStaffMemberDto>> GetStaffMembersAsync(Guid shopId, CancellationToken cancellationToken = default)
    {
        await EnsureManageAsync(shopId, cancellationToken);
        return await _staffMemberRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && !x.IsDeleted)
            .OrderBy(x => x.Name)
            .Select(x => new RotaStaffMemberDto { Id = x.Id, Name = x.Name, Phone = x.Phone, Email = x.Email, IsActive = x.IsActive })
            .ToListAsync(cancellationToken);
    }

    public async Task<RotaStaffMemberDto> CreateStaffMemberAsync(SaveRotaStaffMemberRequest request, CancellationToken cancellationToken = default)
    {
        await EnsureManageAsync(request.ShopId, cancellationToken);
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            throw new AppException("rota_staff_name_required", "Enter a name for the staff member.");
        }
        var now = DateTimeOffset.UtcNow;
        var member = new RotaStaffMember
        {
            ShopId = request.ShopId,
            Name = request.Name.Trim(),
            Phone = string.IsNullOrWhiteSpace(request.Phone) ? null : request.Phone.Trim(),
            Email = string.IsNullOrWhiteSpace(request.Email) ? null : request.Email.Trim(),
            IsActive = true,
            CreatedOn = now,
            CreatedBy = _currentUserService.UserId,
        };
        await _staffMemberRepository.AddAsync(member, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return new RotaStaffMemberDto { Id = member.Id, Name = member.Name, Phone = member.Phone, Email = member.Email, IsActive = member.IsActive };
    }

    public async Task<RotaStaffMemberDto> UpdateStaffMemberAsync(Guid memberId, SaveRotaStaffMemberRequest request, CancellationToken cancellationToken = default)
    {
        var member = await _staffMemberRepository.Query()
            .FirstOrDefaultAsync(x => x.Id == memberId && !x.IsDeleted, cancellationToken)
            ?? throw new AppException("rota_staff_not_found", "Staff member not found.", 404);
        await EnsureManageAsync(member.ShopId, cancellationToken);
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            throw new AppException("rota_staff_name_required", "Enter a name for the staff member.");
        }
        member.Name = request.Name.Trim();
        member.Phone = string.IsNullOrWhiteSpace(request.Phone) ? null : request.Phone.Trim();
        member.Email = string.IsNullOrWhiteSpace(request.Email) ? null : request.Email.Trim();
        member.ModifiedOn = DateTimeOffset.UtcNow;
        member.ModifiedBy = _currentUserService.UserId;
        _staffMemberRepository.Update(member);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return new RotaStaffMemberDto { Id = member.Id, Name = member.Name, Phone = member.Phone, Email = member.Email, IsActive = member.IsActive };
    }

    public async Task DeleteStaffMemberAsync(Guid memberId, CancellationToken cancellationToken = default)
    {
        var member = await _staffMemberRepository.Query()
            .FirstOrDefaultAsync(x => x.Id == memberId && !x.IsDeleted, cancellationToken)
            ?? throw new AppException("rota_staff_not_found", "Staff member not found.", 404);
        await EnsureManageAsync(member.ShopId, cancellationToken);
        member.IsActive = false;
        member.IsDeleted = true;
        member.ModifiedOn = DateTimeOffset.UtcNow;
        member.ModifiedBy = _currentUserService.UserId;
        _staffMemberRepository.Update(member);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
    }

    public async Task<IReadOnlyCollection<RotaShiftTemplateDto>> GetShiftTemplatesAsync(Guid shopId, CancellationToken cancellationToken = default)
    {
        await EnsureManageAsync(shopId, cancellationToken);
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
        await EnsureManageAsync(shopId, cancellationToken);
        var fromBound = new DateTimeOffset(from.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        var toExclusive = new DateTimeOffset(to.AddDays(1).ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);

        var rows = await _attendanceRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && x.CheckInAt >= fromBound && x.CheckInAt < toExclusive)
            .Select(x => new
            {
                x.UserId,
                UserFirstName = x.User != null ? x.User.FirstName : null,
                UserLastName = x.User != null ? x.User.LastName : null,
                x.RotaStaffMemberId,
                MemberName = x.RotaStaffMember != null ? x.RotaStaffMember.Name : null,
                x.CheckInAt,
                x.CheckOutAt,
                x.IsApproved,
                x.RotaShiftId,
            })
            .ToListAsync(cancellationToken);

        // Each person's non-regular assignment reasons, resolved via the session's rota shift.
        // One batched query over all shifts in the range (no N+1); keyed per (shift, person).
        var reasonByShiftPerson = await GetAssignmentReasonsAsync(
            rows.Where(r => r.RotaShiftId != null).Select(r => r.RotaShiftId!.Value), cancellationToken);

        // Labour cost (Growth+). Cost is computed per session at the rate effective on that session's
        // date (effective-dated), then summed — so a mid-period raise doesn't rewrite earlier cost.
        var showCost = await _featureGateService.HasFeatureAsync(shopId, FeatureKeys.StaffRotaLabourCost, cancellationToken);
        var rates = showCost
            ? await _payRateRepository.Query().AsNoTracking().Where(r => r.ShopId == shopId && !r.IsDeleted).ToListAsync(cancellationToken)
            : new List<StaffPayRate>();

        decimal? RateOn(Guid? userId, Guid? memberId, DateOnly date) =>
            rates.Where(r => r.UserId == userId && r.RotaStaffMemberId == memberId && r.EffectiveFrom <= date)
                 .OrderByDescending(r => r.EffectiveFrom)
                 .Select(r => (decimal?)r.HourlyRate)
                 .FirstOrDefault();

        // Hours + cost split into total and the pending (unapproved) portion, so the UI can show
        // approved vs awaiting-approval without hiding anything.
        (decimal Hours, decimal PendingHours, decimal? Cost, decimal? PendingCost) Aggregate(
            IEnumerable<(Guid? UserId, Guid? RotaStaffMemberId, DateTimeOffset CheckInAt, DateTimeOffset? CheckOutAt, bool IsApproved)> sessions)
        {
            decimal hours = 0, pendingHours = 0, cost = 0, pendingCost = 0;
            foreach (var s in sessions.Where(x => x.CheckOutAt != null))
            {
                var h = (decimal)(s.CheckOutAt!.Value - s.CheckInAt).TotalHours;
                hours += h;
                if (!s.IsApproved) pendingHours += h;
                if (showCost)
                {
                    var rate = RateOn(s.UserId, s.RotaStaffMemberId, DateOnly.FromDateTime(s.CheckInAt.UtcDateTime)) ?? 0;
                    cost += h * rate;
                    if (!s.IsApproved) pendingCost += h * rate;
                }
            }
            return (Math.Round(hours, 2), Math.Round(pendingHours, 2),
                    showCost ? Math.Round(cost, 2) : null, showCost ? Math.Round(pendingCost, 2) : null);
        }

        // Approved leave overlapping the range, summed per person per type (overlapping days ×
        // hoursPerDay). Leave data only — no LeaveManagement feature coupling. Paid leave hours
        // also add to LabourCost at the person's current rate (the same rate shown as HourlyRate).
        var leaveRows = await _leaveRequestRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && x.Status == LeaveRequestStatus.Approved
                && x.StartDate <= to && x.EndDate >= from)
            .Select(x => new { x.UserId, x.RotaStaffMemberId, x.Type, x.StartDate, x.EndDate, x.HoursPerDay, x.IsPaid })
            .ToListAsync(cancellationToken);
        var leaveByPerson = leaveRows
            .GroupBy(x => x.UserId != null ? $"u:{x.UserId}" : $"m:{x.RotaStaffMemberId}")
            .ToDictionary(g => g.Key, g =>
            {
                decimal holiday = 0, sick = 0, other = 0, unpaid = 0, paid = 0;
                foreach (var l in g)
                {
                    var hours = OverlapDays(l.StartDate, l.EndDate, from, to) * l.HoursPerDay;
                    switch (l.Type)
                    {
                        case LeaveType.Holiday: holiday += hours; break;
                        case LeaveType.Sick: sick += hours; break;   // paid or not, sick stays sick
                        case LeaveType.Unpaid: unpaid += hours; break;
                        default: other += hours; break;
                    }
                    if (l.IsPaid) paid += hours;
                }
                return (Holiday: Math.Round(holiday, 2), Sick: Math.Round(sick, 2),
                        Other: Math.Round(other, 2), Unpaid: Math.Round(unpaid, 2), Paid: paid,
                        UserId: g.First().UserId, RotaStaffMemberId: g.First().RotaStaffMemberId);
            });

        var result = rows
            .GroupBy(x => x.UserId != null ? $"u:{x.UserId}" : $"m:{x.RotaStaffMemberId}")
            .Select(g =>
            {
                var sample = g.First();
                var agg = Aggregate(g.Select(x => (x.UserId, x.RotaStaffMemberId, x.CheckInAt, x.CheckOutAt, x.IsApproved)));
                leaveByPerson.TryGetValue(g.Key, out var leave);
                var currentRate = showCost ? RateOn(sample.UserId, sample.RotaStaffMemberId, to) : null;
                return new TimesheetRowDto
                {
                    UserId = sample.UserId,
                    RotaStaffMemberId = sample.RotaStaffMemberId,
                    IsExternal = sample.RotaStaffMemberId != null,
                    UserName = (sample.UserId != null ? $"{sample.UserFirstName} {sample.UserLastName}" : sample.MemberName ?? "—").Trim(),
                    ShiftsWorked = g.Count(x => x.CheckOutAt != null),
                    OpenSessions = g.Count(x => x.CheckOutAt == null),
                    TotalHours = agg.Hours,
                    PendingHours = agg.PendingHours,
                    HourlyRate = currentRate,
                    LabourCost = showCost ? Math.Round((agg.Cost ?? 0) + (leave.Paid * (currentRate ?? 0)), 2) : null,
                    PendingLabourCost = agg.PendingCost,
                    HolidayHours = leave.Holiday,
                    SickHours = leave.Sick,
                    OtherLeaveHours = leave.Other,
                    UnpaidLeaveHours = leave.Unpaid,
                    Reasons = g.Where(x => x.RotaShiftId != null)
                        .Select(x => reasonByShiftPerson.GetValueOrDefault((x.RotaShiftId!.Value, x.UserId, x.RotaStaffMemberId)))
                        .OfType<string>()
                        .Distinct()
                        .OrderBy(r => r, StringComparer.OrdinalIgnoreCase)
                        .ToList(),
                };
            })
            .ToList();

        // People with approved leave but no sessions in the range still get a row (their leave
        // hours matter to payroll even when they never clocked in).
        var presentKeys = rows.Select(x => x.UserId != null ? $"u:{x.UserId}" : $"m:{x.RotaStaffMemberId}").ToHashSet();
        var leaveOnly = leaveByPerson.Where(kv => !presentKeys.Contains(kv.Key)).Select(kv => kv.Value).ToList();
        if (leaveOnly.Count > 0)
        {
            var leaveUserIds = leaveOnly.Where(l => l.UserId != null).Select(l => l.UserId!.Value).Distinct().ToList();
            var leaveMemberIds = leaveOnly.Where(l => l.RotaStaffMemberId != null).Select(l => l.RotaStaffMemberId!.Value).Distinct().ToList();
            var nameByUserId = leaveUserIds.Count == 0
                ? new Dictionary<Guid, string>()
                : (await _shopUserRepository.Query()
                    .AsNoTracking()
                    .Where(x => x.ShopId == shopId && leaveUserIds.Contains(x.UserId))
                    .Select(x => new { x.UserId, x.User.FirstName, x.User.LastName })
                    .ToListAsync(cancellationToken))
                    .GroupBy(x => x.UserId)
                    .ToDictionary(x => x.Key, x => $"{x.First().FirstName} {x.First().LastName}".Trim());
            var nameByMemberId = leaveMemberIds.Count == 0
                ? new Dictionary<Guid, string>()
                : await _staffMemberRepository.Query()
                    .AsNoTracking()
                    .Where(x => x.ShopId == shopId && leaveMemberIds.Contains(x.Id))
                    .ToDictionaryAsync(x => x.Id, x => x.Name, cancellationToken);

            foreach (var leave in leaveOnly)
            {
                var currentRate = showCost ? RateOn(leave.UserId, leave.RotaStaffMemberId, to) : null;
                result.Add(new TimesheetRowDto
                {
                    UserId = leave.UserId,
                    RotaStaffMemberId = leave.RotaStaffMemberId,
                    IsExternal = leave.RotaStaffMemberId != null,
                    UserName = leave.UserId != null
                        ? nameByUserId.GetValueOrDefault(leave.UserId.Value, "—")
                        : nameByMemberId.GetValueOrDefault(leave.RotaStaffMemberId!.Value, "—"),
                    HourlyRate = currentRate,
                    LabourCost = showCost ? Math.Round(leave.Paid * (currentRate ?? 0), 2) : null,
                    PendingLabourCost = showCost ? 0 : null,
                    HolidayHours = leave.Holiday,
                    SickHours = leave.Sick,
                    OtherLeaveHours = leave.Other,
                    UnpaidLeaveHours = leave.Unpaid,
                });
            }
        }

        return result.OrderBy(x => x.UserName).ToArray();
    }

    // Non-regular assignment reasons for the given shifts, keyed per (shift, person). One batched
    // query for the whole set — missing keys mean a regular shift or no assignment.
    private async Task<Dictionary<(Guid RotaShiftId, Guid? UserId, Guid? RotaStaffMemberId), string>> GetAssignmentReasonsAsync(
        IEnumerable<Guid> rotaShiftIds, CancellationToken cancellationToken)
    {
        var shiftIds = rotaShiftIds.Distinct().ToList();
        if (shiftIds.Count == 0)
            return [];

        return (await _assignmentRepository.Query()
            .AsNoTracking()
            .Where(a => shiftIds.Contains(a.RotaShiftId) && a.Reason != null)
            .Select(a => new { a.RotaShiftId, a.UserId, a.RotaStaffMemberId, a.Reason })
            .ToListAsync(cancellationToken))
            .GroupBy(a => (a.RotaShiftId, a.UserId, a.RotaStaffMemberId))
            .ToDictionary(g => g.Key, g => g.First().Reason!);
    }

    public async Task<IReadOnlyCollection<ShiftTimesheetRowDto>> GetShiftTimesheetAsync(Guid shopId, DateOnly from, DateOnly to, CancellationToken cancellationToken = default)
    {
        await EnsureManageAsync(shopId, cancellationToken);
        var fromBound = new DateTimeOffset(from.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        var toExclusive = new DateTimeOffset(to.AddDays(1).ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);

        var rows = await _attendanceRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && x.CheckInAt >= fromBound && x.CheckInAt < toExclusive)
            .Select(x => new { x.UserId, x.RotaStaffMemberId, x.CheckInAt, x.CheckOutAt, x.RotaShiftId, x.IsApproved })
            .ToListAsync(cancellationToken);

        var shiftIds = rows.Where(r => r.RotaShiftId != null).Select(r => r.RotaShiftId!.Value).Distinct().ToList();
        var infoById = (await _shiftRepository.Query()
            .AsNoTracking()
            .Where(x => shiftIds.Contains(x.Id))
            .Select(x => new { x.Id, x.ShiftName, x.ShiftDate, x.StartTime, x.EndTime })
            .ToListAsync(cancellationToken))
            .ToDictionary(x => x.Id, x => x);

        // Non-regular assignment reasons per (shift, person), batched across all shifts in the range.
        var reasonByShiftPerson = await GetAssignmentReasonsAsync(shiftIds, cancellationToken);

        // Labour cost (Growth+): per-session hours × rate effective on that session's date, summed.
        var showCost = await _featureGateService.HasFeatureAsync(shopId, FeatureKeys.StaffRotaLabourCost, cancellationToken);
        var rates = showCost
            ? await _payRateRepository.Query().AsNoTracking().Where(r => r.ShopId == shopId && !r.IsDeleted).ToListAsync(cancellationToken)
            : new List<StaffPayRate>();

        decimal? RateOn(Guid? userId, Guid? memberId, DateOnly date) =>
            rates.Where(r => r.UserId == userId && r.RotaStaffMemberId == memberId && r.EffectiveFrom <= date)
                 .OrderByDescending(r => r.EffectiveFrom)
                 .Select(r => (decimal?)r.HourlyRate)
                 .FirstOrDefault();

        (decimal? Cost, decimal? PendingCost, decimal PendingHours) Aggregate(
            IEnumerable<(Guid? UserId, Guid? RotaStaffMemberId, DateTimeOffset CheckInAt, DateTimeOffset? CheckOutAt, bool IsApproved)> sessions)
        {
            decimal cost = 0, pendingCost = 0, pendingHours = 0;
            foreach (var s in sessions.Where(x => x.CheckOutAt != null))
            {
                var hours = (decimal)(s.CheckOutAt!.Value - s.CheckInAt).TotalHours;
                if (!s.IsApproved) pendingHours += hours;
                if (showCost)
                {
                    var rate = RateOn(s.UserId, s.RotaStaffMemberId, DateOnly.FromDateTime(s.CheckInAt.UtcDateTime)) ?? 0;
                    cost += hours * rate;
                    if (!s.IsApproved) pendingCost += hours * rate;
                }
            }
            return (showCost ? Math.Round(cost, 2) : null, showCost ? Math.Round(pendingCost, 2) : null, Math.Round(pendingHours, 2));
        }

        // One row per shift instance (a specific day's shift), plus per-day rows for unrostered clock-ins.
        var rostered = rows
            .Where(r => r.RotaShiftId != null && infoById.ContainsKey(r.RotaShiftId!.Value))
            .GroupBy(r => r.RotaShiftId!.Value)
            .Select(g =>
            {
                var info = infoById[g.Key];
                var agg = Aggregate(g.Select(x => (x.UserId, x.RotaStaffMemberId, x.CheckInAt, x.CheckOutAt, x.IsApproved)));
                return new ShiftTimesheetRowDto
                {
                    ShiftName = info.ShiftName,
                    Date = info.ShiftDate,
                    StartTime = info.StartTime,
                    EndTime = info.EndTime,
                    StaffCount = g.Select(x => x.UserId != null ? $"u:{x.UserId}" : $"m:{x.RotaStaffMemberId}").Distinct().Count(),
                    ShiftsWorked = g.Count(x => x.CheckOutAt != null),
                    OpenSessions = g.Count(x => x.CheckOutAt == null),
                    TotalHours = Math.Round((decimal)g.Where(x => x.CheckOutAt != null).Sum(x => (x.CheckOutAt!.Value - x.CheckInAt).TotalHours), 2),
                    PendingHours = agg.PendingHours,
                    LabourCost = agg.Cost,
                    PendingLabourCost = agg.PendingCost,
                    Reasons = g
                        .Select(x => reasonByShiftPerson.GetValueOrDefault((g.Key, x.UserId, x.RotaStaffMemberId)))
                        .OfType<string>()
                        .Distinct()
                        .OrderBy(r => r, StringComparer.OrdinalIgnoreCase)
                        .ToList(),
                };
            });

        var unrostered = rows
            .Where(r => r.RotaShiftId == null || !infoById.ContainsKey(r.RotaShiftId.Value))
            .GroupBy(r => DateOnly.FromDateTime(r.CheckInAt.UtcDateTime))
            .Select(g =>
            {
                var agg = Aggregate(g.Select(x => (x.UserId, x.RotaStaffMemberId, x.CheckInAt, x.CheckOutAt, x.IsApproved)));
                return new ShiftTimesheetRowDto
                {
                    ShiftName = "Unrostered",
                    Date = g.Key,
                    StaffCount = g.Select(x => x.UserId).Distinct().Count(),
                    ShiftsWorked = g.Count(x => x.CheckOutAt != null),
                    OpenSessions = g.Count(x => x.CheckOutAt == null),
                    TotalHours = Math.Round((decimal)g.Where(x => x.CheckOutAt != null).Sum(x => (x.CheckOutAt!.Value - x.CheckInAt).TotalHours), 2),
                    PendingHours = agg.PendingHours,
                    LabourCost = agg.Cost,
                    PendingLabourCost = agg.PendingCost,
                };
            });

        return rostered.Concat(unrostered)
            .OrderByDescending(x => x.Date)
            .ThenBy(x => x.StartTime ?? TimeOnly.MaxValue)
            .ToArray();
    }

    public async Task<IReadOnlyCollection<TimesheetSessionDto>> GetStaffSessionsAsync(Guid shopId, Guid? userId, Guid? rotaStaffMemberId, DateOnly from, DateOnly to, CancellationToken cancellationToken = default)
    {
        await EnsureManageAsync(shopId, cancellationToken);
        return await QueryStaffSessionsAsync(shopId, userId, rotaStaffMemberId, from, to, cancellationToken);
    }

    // One person's sessions in a period, bounded by check-in date (same bounding as the timesheet/review hour totals).
    private async Task<IReadOnlyCollection<TimesheetSessionDto>> QueryStaffSessionsAsync(Guid shopId, Guid? userId, Guid? rotaStaffMemberId, DateOnly from, DateOnly to, CancellationToken cancellationToken)
    {
        var fromBound = new DateTimeOffset(from.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        var toExclusive = new DateTimeOffset(to.AddDays(1).ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);

        var rows = await _attendanceRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && x.CheckInAt >= fromBound && x.CheckInAt < toExclusive
                && (rotaStaffMemberId != null ? x.RotaStaffMemberId == rotaStaffMemberId : x.UserId == userId))
            .OrderByDescending(x => x.CheckInAt)
            .Select(x => new { x.Id, x.CheckInAt, x.CheckOutAt, x.EntryMethod, x.IsApproved, x.RotaShiftId })
            .ToListAsync(cancellationToken);

        var shiftIds = rows.Where(r => r.RotaShiftId != null).Select(r => r.RotaShiftId!.Value).Distinct().ToList();
        var nameById = (await _shiftRepository.Query()
            .AsNoTracking()
            .Where(x => shiftIds.Contains(x.Id))
            .Select(x => new { x.Id, x.ShiftName })
            .ToListAsync(cancellationToken))
            .ToDictionary(x => x.Id, x => x.ShiftName);

        // This person's assignment reason per shift (one query for the whole session set).
        // Missing/NULL means a regular shift (or no assignment) → Reason stays null.
        var reasonByShift = (await _assignmentRepository.Query()
            .AsNoTracking()
            .Where(a => shiftIds.Contains(a.RotaShiftId)
                && (rotaStaffMemberId != null ? a.RotaStaffMemberId == rotaStaffMemberId : a.UserId == userId))
            .Select(a => new { a.RotaShiftId, a.Reason })
            .ToListAsync(cancellationToken))
            .GroupBy(x => x.RotaShiftId)
            .ToDictionary(g => g.Key, g => g.First().Reason);

        return rows.Select(r => new TimesheetSessionDto
        {
            Id = r.Id,
            Date = DateOnly.FromDateTime(r.CheckInAt.UtcDateTime),
            ShiftName = r.RotaShiftId != null && nameById.TryGetValue(r.RotaShiftId.Value, out var n) ? n : null,
            Reason = r.RotaShiftId != null && reasonByShift.TryGetValue(r.RotaShiftId.Value, out var reason) ? reason : null,
            CheckInAt = r.CheckInAt,
            CheckOutAt = r.CheckOutAt,
            Hours = r.CheckOutAt != null ? Math.Round((decimal)(r.CheckOutAt.Value - r.CheckInAt).TotalHours, 2) : 0,
            EntryMethod = r.EntryMethod.ToString(),
            IsApproved = r.IsApproved,
        }).ToArray();
    }

    public async Task<IReadOnlyCollection<ShiftSessionDto>> GetShiftSessionsAsync(Guid shopId, string shiftName, DateOnly from, DateOnly to, CancellationToken cancellationToken = default)
    {
        await EnsureManageAsync(shopId, cancellationToken);
        var fromBound = new DateTimeOffset(from.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        var toExclusive = new DateTimeOffset(to.AddDays(1).ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        var unrostered = string.Equals(shiftName, "Unrostered", StringComparison.OrdinalIgnoreCase);

        // Rota shift ids (for this shop) that carry the requested shift name.
        var shiftIds = unrostered
            ? new List<Guid>()
            : await _shiftRepository.Query()
                .AsNoTracking()
                .Where(x => x.ShopId == shopId && x.ShiftName == shiftName)
                .Select(x => x.Id)
                .ToListAsync(cancellationToken);

        var rows = await _attendanceRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && x.CheckInAt >= fromBound && x.CheckInAt < toExclusive
                && (unrostered ? x.RotaShiftId == null : x.RotaShiftId != null && shiftIds.Contains(x.RotaShiftId.Value)))
            .OrderByDescending(x => x.CheckInAt)
            .Select(x => new
            {
                x.Id,
                x.UserId,
                UserFirstName = x.User != null ? x.User.FirstName : null,
                UserLastName = x.User != null ? x.User.LastName : null,
                x.RotaStaffMemberId,
                MemberName = x.RotaStaffMember != null ? x.RotaStaffMember.Name : null,
                x.CheckInAt,
                x.CheckOutAt,
                x.EntryMethod,
                x.IsApproved,
                x.RotaShiftId,
            })
            .ToListAsync(cancellationToken);

        // Non-regular assignment reasons per (shift, person), batched across the sessions' shifts.
        var reasonByShiftPerson = await GetAssignmentReasonsAsync(
            rows.Where(r => r.RotaShiftId != null).Select(r => r.RotaShiftId!.Value), cancellationToken);

        return rows.Select(r => new ShiftSessionDto
        {
            Id = r.Id,
            Date = DateOnly.FromDateTime(r.CheckInAt.UtcDateTime),
            UserId = r.UserId,
            RotaStaffMemberId = r.RotaStaffMemberId,
            IsExternal = r.RotaStaffMemberId != null,
            UserName = (r.UserId != null ? $"{r.UserFirstName} {r.UserLastName}" : r.MemberName ?? "—").Trim(),
            Reason = r.RotaShiftId != null
                ? reasonByShiftPerson.GetValueOrDefault((r.RotaShiftId.Value, r.UserId, r.RotaStaffMemberId))
                : null,
            CheckInAt = r.CheckInAt,
            CheckOutAt = r.CheckOutAt,
            Hours = r.CheckOutAt != null ? Math.Round((decimal)(r.CheckOutAt.Value - r.CheckInAt).TotalHours, 2) : 0,
            EntryMethod = r.EntryMethod.ToString(),
            IsApproved = r.IsApproved,
        }).ToArray();
    }

    public async Task<BusinessDayStaffDto> GetBusinessDayStaffAsync(Guid shopId, DateOnly date, CancellationToken cancellationToken = default)
    {
        await EnsureStaffAsync(shopId, cancellationToken);

        var day = await _businessDayRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && x.BusinessDate == date)
            .Select(x => new { x.Id, x.Status })
            .FirstOrDefaultAsync(cancellationToken);

        // Rostered: the shifts this BUSINESS day covers. For an overnight business window
        // (start > end, e.g. 22:00 -> 09:59) the business date is the close date, so the day
        // also owns shifts that start after the window's end time on the PREVIOUS calendar date
        // (a 22:00 night shift on the 6th is the first shift of the 7th's business day) — and it
        // does NOT own this date's late-starting shifts, which belong to the next business day.
        var businessSetup = await _shopConfigurationService.GetBusinessDaySetupAsync(shopId, cancellationToken);
        var overnightWindow = businessSetup.BusinessStartTime > businessSetup.BusinessEndTime;
        var windowEnd = TimeOnly.FromTimeSpan(businessSetup.BusinessEndTime);
        var previousDate = date.AddDays(-1);
        var shiftsQuery = _shiftRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && !x.IsDeleted);
        shiftsQuery = overnightWindow
            ? shiftsQuery.Where(x =>
                (x.ShiftDate == previousDate && x.StartTime > windowEnd) ||
                (x.ShiftDate == date && x.StartTime <= windowEnd))
            : shiftsQuery.Where(x => x.ShiftDate == date);
        var shifts = await shiftsQuery
            .Include(x => x.Assignments).ThenInclude(a => a.User)
            .Include(x => x.Assignments).ThenInclude(a => a.RotaStaffMember)
            .ToListAsync(cancellationToken);

        // Attendance for the day — by the linked business day if present, else by the same
        // window the roster uses (overnight: from the previous date's window end to this date's).
        var fromBound = overnightWindow
            ? new DateTimeOffset(previousDate.ToDateTime(windowEnd), TimeSpan.Zero)
            : new DateTimeOffset(date.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        var toExclusive = overnightWindow
            ? new DateTimeOffset(date.ToDateTime(windowEnd), TimeSpan.Zero)
            : new DateTimeOffset(date.AddDays(1).ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        var attendance = await _attendanceRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId
                && (day != null && x.BusinessDayId == day.Id || x.CheckInAt >= fromBound && x.CheckInAt < toExclusive))
            .Select(x => new
            {
                x.UserId,
                UserFirstName = x.User != null ? x.User.FirstName : null,
                UserLastName = x.User != null ? x.User.LastName : null,
                x.RotaStaffMemberId,
                MemberName = x.RotaStaffMember != null ? x.RotaStaffMember.Name : null,
                x.CheckInAt,
                x.CheckOutAt,
            })
            .ToListAsync(cancellationToken);

        // Rows keyed by person ("u:<userId>" or "m:<memberId>") so users and roster members coexist.
        var rows = new Dictionary<string, BusinessDayStaffRowDto>();

        foreach (var shift in shifts)
        {
            foreach (var a in shift.Assignments)
            {
                var key = a.UserId != null ? $"u:{a.UserId}" : $"m:{a.RotaStaffMemberId}";
                if (!rows.TryGetValue(key, out var row))
                {
                    row = new BusinessDayStaffRowDto
                    {
                        UserId = a.UserId,
                        RotaStaffMemberId = a.RotaStaffMemberId,
                        IsExternal = a.RotaStaffMemberId != null,
                        UserName = a.User != null ? FullName(a.User) : (a.RotaStaffMember?.Name ?? "—"),
                    };
                    rows[key] = row;
                }
                if (row.StartTime is null || shift.StartTime < row.StartTime)
                {
                    row.ShiftName = shift.ShiftName;
                    row.Reason = a.Reason;
                    row.StartTime = shift.StartTime;
                    row.EndTime = shift.EndTime;
                }
            }
        }

        foreach (var group in attendance.GroupBy(x => x.UserId != null ? $"u:{x.UserId}" : $"m:{x.RotaStaffMemberId}"))
        {
            var sample = group.First();
            if (!rows.TryGetValue(group.Key, out var row))
            {
                row = new BusinessDayStaffRowDto
                {
                    UserId = sample.UserId,
                    RotaStaffMemberId = sample.RotaStaffMemberId,
                    IsExternal = sample.RotaStaffMemberId != null,
                    UserName = (sample.UserId != null ? $"{sample.UserFirstName} {sample.UserLastName}" : sample.MemberName ?? "—").Trim(),
                };
                rows[group.Key] = row;
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
        await EnsureStaffAsync(shopId, cancellationToken);
        var userId = CurrentUserId;
        var shifts = await _shiftRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && !x.IsDeleted && x.ShiftDate >= from && x.ShiftDate <= to
                && x.Assignments.Any(a => a.UserId == userId))
            .Include(x => x.Assignments).ThenInclude(a => a.User)
            .Include(x => x.Assignments).ThenInclude(a => a.RotaStaffMember)
            .OrderBy(x => x.ShiftDate).ThenBy(x => x.StartTime)
            .ToListAsync(cancellationToken);

        var shiftIds = shifts.Select(s => s.Id).ToList();
        var attendance = await _attendanceRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && x.UserId == userId && x.RotaShiftId != null && shiftIds.Contains(x.RotaShiftId.Value))
            .ToListAsync(cancellationToken);
        // All sessions per shift, oldest first — a shift can hold several when the user clocks
        // out and back in (e.g. a lunch break). The most recent drives the card's current state.
        var sessionsByShift = attendance
            .GroupBy(x => x.RotaShiftId!.Value)
            .ToDictionary(g => g.Key, g => g.OrderBy(a => a.CheckInAt).ToList());

        var name = _currentUserService.FullName;
        return shifts.Select(s =>
        {
            var dto = MapShift(s);
            if (sessionsByShift.TryGetValue(s.Id, out var sessions))
            {
                var mapped = sessions.Select(a => MapAttendance(a, name)).ToArray();
                dto.MySessions = mapped;
                dto.MyAttendance = mapped[^1];
            }
            return dto;
        }).ToArray();
    }

    public async Task<ShiftAttendanceDto?> GetMyCurrentAttendanceAsync(Guid shopId, CancellationToken cancellationToken = default)
    {
        await EnsureStaffAsync(shopId, cancellationToken);
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
        // Check-in/out are role-gated only (no subscription feature gate) so attendance always works.
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
        // Role-gated only (see CheckInAsync) — check-out must always be possible.
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
        RotaStaffMemberId = a.RotaStaffMemberId,
        IsExternal = a.RotaStaffMemberId != null,
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
        if (request.CheckOutAt is DateTimeOffset outAt && outAt <= request.CheckInAt)
        {
            throw new AppException("rota_invalid_times", "Check-out time must be after check-in time.");
        }

        // A manager recording hours for a roster-only member (auto-approved, manager-authoritative).
        if (request.RotaStaffMemberId is Guid memberId)
        {
            return await RecordMemberAttendanceAsync(request, memberId, cancellationToken);
        }

        // A manager recording hours for another internal user (auto-approved, manager-authoritative).
        if (request.UserId is Guid targetUserId && targetUserId != CurrentUserId)
        {
            return await RecordUserAttendanceAsync(request, targetUserId, cancellationToken);
        }

        await EnsureStaffAsync(request.ShopId, cancellationToken, FeatureKeys.StaffRotaManualApproval);
        var userId = CurrentUserId;
        await EnsureAttendanceNotLockedAsync(request.ShopId, request.CheckInAt, cancellationToken);

        // Update the user's existing record for this shift if there is one, else create a new manual entry.
        ShiftAttendance? attendance = null;
        if (request.RotaShiftId is Guid sid)
        {
            attendance = await _attendanceRepository.Query()
                .Where(x => x.ShopId == request.ShopId && x.UserId == userId && x.RotaShiftId == sid)
                .OrderByDescending(x => x.CheckInAt)
                .FirstOrDefaultAsync(cancellationToken);
        }
        // Only an already-approved record counted toward the timesheet before this overwrite.
        var previousCountedCheckInAt = attendance is { IsApproved: true } ? (DateTimeOffset?)attendance.CheckInAt : null;
        if (attendance is not null)
        {
            // The record being overwritten must not sit inside the payroll lock either.
            await EnsureAttendanceNotLockedAsync(request.ShopId, attendance.CheckInAt, cancellationToken);
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

        if (previousCountedCheckInAt is DateTimeOffset previousCounted)
        {
            // The overwritten approved hours no longer count — any sign-off covering them is stale.
            await ResetSignedOffReviewsAsync(request.ShopId, userId, [previousCounted], cancellationToken);
        }

        // Notify managers/owners that a manual entry needs approval (push; non-blocking).
        await NotifyManagersOfManualEntryAsync(request.ShopId, _currentUserService.FullName, cancellationToken);

        return MapAttendance(attendance, _currentUserService.FullName);
    }

    // Manager records (or edits) worked hours for a roster-only member. Manager-authoritative, so it's
    // saved already-approved (no self-entry approval needed).
    private async Task<ShiftAttendanceDto> RecordMemberAttendanceAsync(ManualAttendanceRequest request, Guid memberId, CancellationToken cancellationToken)
    {
        await EnsureManageAsync(request.ShopId, cancellationToken, FeatureKeys.StaffRotaManualApproval);
        var member = await _staffMemberRepository.Query()
            .FirstOrDefaultAsync(x => x.Id == memberId && x.ShopId == request.ShopId && !x.IsDeleted, cancellationToken)
            ?? throw new AppException("rota_staff_not_found", "Staff member not found.", 404);
        await EnsureAttendanceNotLockedAsync(request.ShopId, request.CheckInAt, cancellationToken);

        var now = DateTimeOffset.UtcNow;
        var businessDayId = request.RotaShiftId is Guid shiftId
            ? await _shiftRepository.Query().Where(x => x.Id == shiftId).Select(x => x.BusinessDayId).FirstOrDefaultAsync(cancellationToken)
            : null;

        ShiftAttendance? attendance = null;
        if (request.RotaShiftId is Guid sid)
        {
            attendance = await _attendanceRepository.Query()
                .Where(x => x.ShopId == request.ShopId && x.RotaStaffMemberId == memberId && x.RotaShiftId == sid)
                .OrderByDescending(x => x.CheckInAt)
                .FirstOrDefaultAsync(cancellationToken);
        }
        if (attendance is not null)
        {
            // The record being overwritten must not sit inside the payroll lock either.
            await EnsureAttendanceNotLockedAsync(request.ShopId, attendance.CheckInAt, cancellationToken);
        }

        if (attendance is null)
        {
            attendance = new ShiftAttendance
            {
                ShopId = request.ShopId,
                RotaStaffMemberId = memberId,
                RotaShiftId = request.RotaShiftId,
                BusinessDayId = businessDayId,
                CreatedOn = now,
                CreatedBy = _currentUserService.UserId,
            };
            await _attendanceRepository.AddAsync(attendance, cancellationToken);
        }
        else
        {
            attendance.ModifiedOn = now;
            attendance.ModifiedBy = _currentUserService.UserId;
            _attendanceRepository.Update(attendance);
        }

        attendance.CheckInAt = request.CheckInAt;
        attendance.CheckOutAt = request.CheckOutAt;
        attendance.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
        attendance.EntryMethod = AttendanceEntryMethod.Manual;
        attendance.IsApproved = true; // manager-recorded — authoritative
        attendance.ApprovedByUserId = _currentUserService.UserId;
        attendance.ApprovedOn = now;

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return MapAttendance(attendance, member.Name);
    }

    // Manager records (or edits) worked hours for another internal user. Manager-authoritative, so it's
    // saved already-approved (no self-entry approval needed).
    private async Task<ShiftAttendanceDto> RecordUserAttendanceAsync(ManualAttendanceRequest request, Guid targetUserId, CancellationToken cancellationToken)
    {
        await EnsureManageAsync(request.ShopId, cancellationToken, FeatureKeys.StaffRotaManualApproval);
        var target = await _shopUserRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == request.ShopId && x.UserId == targetUserId && x.IsActive)
            .Select(x => new { x.User.FirstName, x.User.LastName })
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new AppException("rota_staff_not_found", "Staff member not found.", 404);
        await EnsureAttendanceNotLockedAsync(request.ShopId, request.CheckInAt, cancellationToken);

        var now = DateTimeOffset.UtcNow;
        var businessDayId = request.RotaShiftId is Guid shiftId
            ? await _shiftRepository.Query().Where(x => x.Id == shiftId).Select(x => x.BusinessDayId).FirstOrDefaultAsync(cancellationToken)
            : null;

        ShiftAttendance? attendance = null;
        if (request.RotaShiftId is Guid sid)
        {
            attendance = await _attendanceRepository.Query()
                .Where(x => x.ShopId == request.ShopId && x.UserId == targetUserId && x.RotaShiftId == sid)
                .OrderByDescending(x => x.CheckInAt)
                .FirstOrDefaultAsync(cancellationToken);
        }
        var previousCheckInAt = attendance?.CheckInAt;
        if (attendance is not null)
        {
            // The record being overwritten must not sit inside the payroll lock either.
            await EnsureAttendanceNotLockedAsync(request.ShopId, attendance.CheckInAt, cancellationToken);
        }

        if (attendance is null)
        {
            attendance = new ShiftAttendance
            {
                ShopId = request.ShopId,
                UserId = targetUserId,
                RotaShiftId = request.RotaShiftId,
                BusinessDayId = businessDayId,
                CreatedOn = now,
                CreatedBy = _currentUserService.UserId,
            };
            await _attendanceRepository.AddAsync(attendance, cancellationToken);
        }
        else
        {
            attendance.ModifiedOn = now;
            attendance.ModifiedBy = _currentUserService.UserId;
            _attendanceRepository.Update(attendance);
        }

        attendance.CheckInAt = request.CheckInAt;
        attendance.CheckOutAt = request.CheckOutAt;
        attendance.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
        attendance.EntryMethod = AttendanceEntryMethod.Manual;
        attendance.IsApproved = true; // manager-recorded — authoritative
        attendance.ApprovedByUserId = _currentUserService.UserId;
        attendance.ApprovedOn = now;

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        // Manager-edited hours invalidate any sign-off covering the old or new day.
        var affectedTimes = previousCheckInAt is DateTimeOffset previous
            ? new[] { previous, request.CheckInAt }
            : new[] { request.CheckInAt };
        await ResetSignedOffReviewsAsync(request.ShopId, targetUserId, affectedTimes, cancellationToken);

        return MapAttendance(attendance, $"{target.FirstName} {target.LastName}".Trim());
    }

    // Push the shop's managers/owners that a staff member submitted manual times for approval.
    private async Task NotifyManagersOfManualEntryAsync(Guid shopId, string staffName, CancellationToken cancellationToken)
    {
        try
        {
            var managerUserIds = await _shopUserRepository.Query()
                .AsNoTracking()
                .Where(x => x.ShopId == shopId && x.IsActive
                    && (x.Role.Name == RoleNames.CompanyOwner || x.Role.Name == RoleNames.Manager))
                .Select(x => x.UserId)
                .ToListAsync(cancellationToken);
            if (managerUserIds.Count == 0) return;

            var tokens = await _pushTokenRepository.Query()
                .AsNoTracking()
                .Where(t => t.ShopId == shopId && t.IsActive && t.PushToken != "" && managerUserIds.Contains(t.UserId))
                .Select(t => t.PushToken)
                .Distinct()
                .ToListAsync(cancellationToken);

            foreach (var token in tokens)
            {
                await _notificationService.SendAsync(new NotificationMessage
                {
                    ShopId = shopId,
                    NotificationType = NotificationType.ShiftManualEntrySubmitted,
                    Channel = NotificationChannel.InApp,
                    Recipient = token,
                    Subject = "Time approval needed",
                    Body = $"{staffName} submitted manual times for approval.",
                    RelatedEntityName = nameof(ShiftAttendance),
                }, cancellationToken);
            }
        }
        catch
        {
            // Notification failures must not block the staff member's submission.
        }
    }

    private static RotaTimesheetLockDto MapTimesheetLock(RotaTimesheetLock l, string lockedByName) => new()
    {
        ShopId = l.ShopId,
        LockedThrough = l.LockedThrough,
        LockedByUserId = l.LockedByUserId,
        LockedByName = lockedByName,
        LockedOn = l.LockedOn,
        Notes = l.Notes,
    };

    public async Task<RotaTimesheetLockDto?> GetTimesheetLockAsync(Guid shopId, CancellationToken cancellationToken = default)
    {
        await EnsureManageAsync(shopId, cancellationToken);
        var lockRow = await _timesheetLockRepository.Query()
            .AsNoTracking()
            .Include(x => x.LockedByUser)
            .FirstOrDefaultAsync(x => x.ShopId == shopId, cancellationToken);
        return lockRow is null ? null : MapTimesheetLock(lockRow, FullName(lockRow.LockedByUser));
    }

    public async Task<RotaTimesheetLockDto?> SetTimesheetLockAsync(SetTimesheetLockRequest request, CancellationToken cancellationToken = default)
    {
        await EnsureManageAsync(request.ShopId, cancellationToken);
        var existing = await _timesheetLockRepository.Query()
            .FirstOrDefaultAsync(x => x.ShopId == request.ShopId, cancellationToken);

        // Null clears the lock (unlock) entirely.
        if (request.LockedThrough is not DateOnly lockedThrough)
        {
            if (existing is not null)
            {
                _timesheetLockRepository.Remove(existing);
                await _unitOfWork.SaveChangesAsync(cancellationToken);
            }
            return null;
        }

        var now = DateTimeOffset.UtcNow;
        // A lock always sits in the past, so it can never interfere with live clock-ins/outs.
        if (lockedThrough >= DateOnly.FromDateTime(now.UtcDateTime))
        {
            throw new AppException("rota_lock_invalid_date", "The lock date must be before today.");
        }

        if (existing is null)
        {
            existing = new RotaTimesheetLock
            {
                ShopId = request.ShopId,
                CreatedOn = now,
                CreatedBy = _currentUserService.UserId,
            };
            await _timesheetLockRepository.AddAsync(existing, cancellationToken);
        }
        else
        {
            existing.ModifiedOn = now;
            existing.ModifiedBy = _currentUserService.UserId;
            _timesheetLockRepository.Update(existing);
        }

        existing.LockedThrough = lockedThrough;
        existing.LockedByUserId = CurrentUserId;
        existing.LockedOn = now;
        existing.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return MapTimesheetLock(existing, _currentUserService.FullName);
    }

    // Attendance whose check-in date falls on or before the shop's payroll lock is frozen — wages
    // for that period have been paid (see RotaTimesheetLock), so edits would silently drift payroll.
    private async Task EnsureAttendanceNotLockedAsync(Guid shopId, DateTimeOffset checkInAt, CancellationToken cancellationToken)
    {
        var lockedThrough = await _timesheetLockRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId)
            .Select(x => (DateOnly?)x.LockedThrough)
            .FirstOrDefaultAsync(cancellationToken);
        if (lockedThrough is DateOnly through && DateOnly.FromDateTime(checkInAt.UtcDateTime) <= through)
        {
            throw new AppException("rota_timesheet_locked",
                $"This period is locked for payroll (locked through {through:d MMM yyyy}). Unlock it in Timesheet before editing.");
        }
    }

    // --- Timesheet reviews: staff sign-off of a pay period before it's locked and exported ---

    // A review whose period sits entirely inside the payroll lock is frozen — wages already paid.
    private async Task EnsureReviewPeriodNotLockedAsync(Guid shopId, DateOnly periodTo, CancellationToken cancellationToken)
    {
        var lockedThrough = await _timesheetLockRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId)
            .Select(x => (DateOnly?)x.LockedThrough)
            .FirstOrDefaultAsync(cancellationToken);
        if (lockedThrough is DateOnly through && periodTo <= through)
        {
            throw new AppException("rota_timesheet_locked",
                $"This period is locked for payroll (locked through {through:d MMM yyyy}). Unlock it in Timesheet before editing.");
        }
    }

    // Sign-off integrity: changing the counted hours inside a period the person already Confirmed
    // (or that was ManagerApproved) would silently invalidate their sign-off. Those reviews drop
    // back to PendingStaff for re-confirmation and the person is told why. Call AFTER the
    // attendance change has been saved. Roster-only staff aren't in the review workflow.
    private async Task ResetSignedOffReviewsAsync(Guid shopId, Guid? userId, IReadOnlyCollection<DateTimeOffset> affectedTimes, CancellationToken cancellationToken)
    {
        if (userId is not Guid uid || affectedTimes.Count == 0) return;
        var dates = affectedTimes.Select(t => DateOnly.FromDateTime(t.UtcDateTime)).Distinct().ToList();
        var min = dates.Min();
        var max = dates.Max();
        var candidates = await _timesheetReviewRepository.Query()
            .Where(x => x.ShopId == shopId && x.UserId == uid
                && x.PeriodFrom <= max && x.PeriodTo >= min
                && (x.Status == RotaTimesheetReviewStatus.Confirmed || x.Status == RotaTimesheetReviewStatus.ManagerApproved))
            .ToListAsync(cancellationToken);
        var affected = candidates.Where(x => dates.Any(d => x.PeriodFrom <= d && x.PeriodTo >= d)).ToList();
        if (affected.Count == 0) return;

        var now = DateTimeOffset.UtcNow;
        foreach (var review in affected)
        {
            review.Status = RotaTimesheetReviewStatus.PendingStaff;
            review.ConfirmedOn = null;
            review.ResolvedByUserId = null;
            review.ResolvedOn = null;
            review.ManagerNote = "Hours were changed after sign-off — please check the period and confirm again.";
            review.ModifiedOn = now;
            review.ModifiedBy = _currentUserService.UserId;
            _timesheetReviewRepository.Update(review);
        }
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await NotifyUsersAsync(shopId, [uid], NotificationType.TimesheetReviewRequested,
            "Timesheet updated",
            "Your hours were updated after you signed off — please review and confirm your timesheet again.",
            affected[0].Id, cancellationToken);
    }

    private async Task<RotaTimesheetReview> GetReviewAsync(Guid reviewId, CancellationToken cancellationToken) =>
        await _timesheetReviewRepository.Query()
            .Include(x => x.User)
            .FirstOrDefaultAsync(x => x.Id == reviewId, cancellationToken)
            ?? throw new AppException("rota_review_not_found", "Timesheet review not found.", 404);

    private static RotaTimesheetReviewDto MapReview(RotaTimesheetReview r, string userName, decimal totalHours, int openSessions) => new()
    {
        Id = r.Id,
        ShopId = r.ShopId,
        PeriodFrom = r.PeriodFrom,
        PeriodTo = r.PeriodTo,
        UserId = r.UserId,
        UserName = userName,
        Status = r.Status.ToString(),
        StaffNote = r.StaffNote,
        ManagerNote = r.ManagerNote,
        ConfirmedOn = r.ConfirmedOn,
        ResolvedByUserId = r.ResolvedByUserId,
        ResolvedOn = r.ResolvedOn,
        TotalHours = totalHours,
        OpenSessions = openSessions,
    };

    // Completed hours + open-session count per registered user for a period (same aggregation as the timesheet).
    private async Task<Dictionary<Guid, (decimal Hours, int OpenSessions)>> GetUserHoursAsync(
        Guid shopId, DateOnly from, DateOnly to, IReadOnlyCollection<Guid> userIds, CancellationToken cancellationToken)
    {
        var fromBound = new DateTimeOffset(from.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        var toExclusive = new DateTimeOffset(to.AddDays(1).ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        var sessions = await _attendanceRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && x.UserId != null && userIds.Contains(x.UserId.Value)
                && x.CheckInAt >= fromBound && x.CheckInAt < toExclusive)
            .Select(x => new { UserId = x.UserId!.Value, x.CheckInAt, x.CheckOutAt })
            .ToListAsync(cancellationToken);
        return sessions
            .GroupBy(x => x.UserId)
            .ToDictionary(
                g => g.Key,
                g => (
                    Math.Round((decimal)g.Where(x => x.CheckOutAt != null).Sum(x => (x.CheckOutAt!.Value - x.CheckInAt).TotalHours), 2),
                    g.Count(x => x.CheckOutAt == null)));
    }

    // Reviews (User loaded) → DTOs with each person's hours for that row's period.
    private async Task<IReadOnlyCollection<RotaTimesheetReviewDto>> BuildReviewDtosAsync(List<RotaTimesheetReview> reviews, CancellationToken cancellationToken)
    {
        var dtos = new List<RotaTimesheetReviewDto>(reviews.Count);
        foreach (var period in reviews.GroupBy(r => new { r.ShopId, r.PeriodFrom, r.PeriodTo }))
        {
            var hours = await GetUserHoursAsync(period.Key.ShopId, period.Key.PeriodFrom, period.Key.PeriodTo,
                period.Select(r => r.UserId).Distinct().ToList(), cancellationToken);
            dtos.AddRange(period.Select(r =>
            {
                hours.TryGetValue(r.UserId, out var h);
                return MapReview(r, FullName(r.User), h.Hours, h.OpenSessions);
            }));
        }
        return dtos.OrderByDescending(x => x.PeriodFrom).ThenBy(x => x.UserName).ToArray();
    }

    private async Task<RotaTimesheetReviewDto> MapReviewWithHoursAsync(RotaTimesheetReview review, CancellationToken cancellationToken)
    {
        var hours = await GetUserHoursAsync(review.ShopId, review.PeriodFrom, review.PeriodTo, [review.UserId], cancellationToken);
        hours.TryGetValue(review.UserId, out var h);
        return MapReview(review, FullName(review.User), h.Hours, h.OpenSessions);
    }

    // Push the given registered users (best-effort; failures never block the calling action).
    private async Task NotifyUsersAsync(Guid shopId, IReadOnlyCollection<Guid> userIds, NotificationType type,
        string subject, string body, Guid? relatedId, CancellationToken cancellationToken)
    {
        try
        {
            if (userIds.Count == 0) return;
            var tokens = await _pushTokenRepository.Query()
                .AsNoTracking()
                .Where(t => t.ShopId == shopId && t.IsActive && t.PushToken != "" && userIds.Contains(t.UserId))
                .Select(t => t.PushToken)
                .Distinct()
                .ToListAsync(cancellationToken);

            foreach (var token in tokens)
            {
                await _notificationService.SendAsync(new NotificationMessage
                {
                    ShopId = shopId,
                    NotificationType = type,
                    Channel = NotificationChannel.InApp,
                    Recipient = token,
                    Subject = subject,
                    Body = body,
                    RelatedEntityName = nameof(RotaTimesheetReview),
                    RelatedEntityId = relatedId,
                }, cancellationToken);
            }
        }
        catch
        {
            // Notification failures must not block the review workflow.
        }
    }

    // Push the shop's managers/owners (best-effort, same recipients as manual-entry approval pushes).
    private async Task NotifyManagersAsync(Guid shopId, NotificationType type, string subject, string body, Guid? relatedId, CancellationToken cancellationToken)
    {
        try
        {
            var managerUserIds = await _shopUserRepository.Query()
                .AsNoTracking()
                .Where(x => x.ShopId == shopId && x.IsActive
                    && (x.Role.Name == RoleNames.CompanyOwner || x.Role.Name == RoleNames.Manager))
                .Select(x => x.UserId)
                .ToListAsync(cancellationToken);
            await NotifyUsersAsync(shopId, managerUserIds, type, subject, body, relatedId, cancellationToken);
        }
        catch
        {
            // Best-effort.
        }
    }

    public async Task<IReadOnlyCollection<RotaTimesheetReviewDto>> RequestTimesheetReviewsAsync(RequestTimesheetReviewsRequest request, CancellationToken cancellationToken = default)
    {
        await EnsureManageAsync(request.ShopId, cancellationToken);
        if (request.To < request.From)
        {
            throw new AppException("rota_review_invalid_period", "The period end must be on or after its start.");
        }
        await EnsureReviewPeriodNotLockedAsync(request.ShopId, request.To, cancellationToken);

        // Everyone with hours in the period: attendance (by check-in date) OR a rota assignment.
        // Registered users only — external members are manager-recorded, so there's nothing to confirm.
        var fromBound = new DateTimeOffset(request.From.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        var toExclusive = new DateTimeOffset(request.To.AddDays(1).ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        var attendanceUserIds = await _attendanceRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == request.ShopId && x.UserId != null && x.CheckInAt >= fromBound && x.CheckInAt < toExclusive)
            .Select(x => x.UserId!.Value)
            .Distinct()
            .ToListAsync(cancellationToken);
        var assignedUserIds = await _assignmentRepository.Query()
            .AsNoTracking()
            .Where(a => a.ShopId == request.ShopId && a.UserId != null
                && !a.RotaShift.IsDeleted && a.RotaShift.ShiftDate >= request.From && a.RotaShift.ShiftDate <= request.To)
            .Select(a => a.UserId!.Value)
            .Distinct()
            .ToListAsync(cancellationToken);
        var userIds = attendanceUserIds.Union(assignedUserIds).ToList();

        // Targeted request: a single person instead of everyone with hours in the period.
        if (request.UserId is Guid onlyUserId)
        {
            userIds = userIds.Where(id => id == onlyUserId).ToList();
            if (userIds.Count == 0)
            {
                throw new AppException("rota_review_no_hours", "That person has no hours or shifts in this period.");
            }
        }

        // Create missing rows only — existing rows (whatever their status) are left untouched.
        var existing = await _timesheetReviewRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == request.ShopId && x.PeriodFrom == request.From && x.PeriodTo == request.To)
            .Select(x => new { x.UserId, x.Status })
            .ToListAsync(cancellationToken);
        var existingUserIds = existing.Select(x => x.UserId).ToHashSet();

        var now = DateTimeOffset.UtcNow;
        var newUserIds = userIds.Where(id => !existingUserIds.Contains(id)).ToList();
        foreach (var userId in newUserIds)
        {
            await _timesheetReviewRepository.AddAsync(new RotaTimesheetReview
            {
                ShopId = request.ShopId,
                PeriodFrom = request.From,
                PeriodTo = request.To,
                UserId = userId,
                Status = RotaTimesheetReviewStatus.PendingStaff,
                CreatedOn = now,
                CreatedBy = _currentUserService.UserId,
            }, cancellationToken);
        }
        if (newUserIds.Count > 0)
        {
            await _unitOfWork.SaveChangesAsync(cancellationToken);
        }

        // Nudge everyone still waiting to confirm (new rows + previously requested, unanswered ones).
        var pendingUserIds = newUserIds
            .Concat(existing.Where(x => x.Status == RotaTimesheetReviewStatus.PendingStaff).Select(x => x.UserId))
            .Distinct()
            .ToList();
        await NotifyUsersAsync(request.ShopId, pendingUserIds, NotificationType.TimesheetReviewRequested,
            "Timesheet ready to review",
            $"Your timesheet for {request.From:d MMM yyyy}–{request.To:d MMM yyyy} is ready to review. Confirm your hours in the app.",
            null, cancellationToken);

        return await GetTimesheetReviewsAsync(request.ShopId, request.From, request.To, cancellationToken);
    }

    public async Task<IReadOnlyCollection<RotaTimesheetReviewDto>> GetTimesheetReviewsAsync(Guid shopId, DateOnly from, DateOnly to, CancellationToken cancellationToken = default)
    {
        await EnsureManageAsync(shopId, cancellationToken);
        var reviews = await _timesheetReviewRepository.Query()
            .AsNoTracking()
            .Include(x => x.User)
            .Where(x => x.ShopId == shopId && x.PeriodFrom == from && x.PeriodTo == to)
            .ToListAsync(cancellationToken);
        return await BuildReviewDtosAsync(reviews, cancellationToken);
    }

    public async Task<IReadOnlyCollection<RotaTimesheetReviewDto>> GetTimesheetReviewHistoryAsync(Guid shopId, int take, CancellationToken cancellationToken = default)
    {
        await EnsureManageAsync(shopId, cancellationToken);
        if (take <= 0) take = 100;
        var reviews = await _timesheetReviewRepository.Query()
            .AsNoTracking()
            .Include(x => x.User)
            .Where(x => x.ShopId == shopId && x.Status == RotaTimesheetReviewStatus.ManagerApproved)
            .OrderByDescending(x => x.PeriodTo)
            .ThenBy(x => x.User.FirstName).ThenBy(x => x.User.LastName)
            .Take(take)
            .ToListAsync(cancellationToken);
        return (await BuildReviewDtosAsync(reviews, cancellationToken))
            .OrderByDescending(x => x.PeriodTo)
            .ThenBy(x => x.UserName)
            .ToArray();
    }

    public async Task<IReadOnlyCollection<RotaTimesheetReviewDto>> GetMyTimesheetReviewHistoryAsync(Guid shopId, int take, CancellationToken cancellationToken = default)
    {
        await EnsureStaffAsync(shopId, cancellationToken);
        var userId = CurrentUserId;
        if (take <= 0) take = 50;
        var reviews = await _timesheetReviewRepository.Query()
            .AsNoTracking()
            .Include(x => x.User)
            .Where(x => x.ShopId == shopId && x.UserId == userId && x.Status == RotaTimesheetReviewStatus.ManagerApproved)
            .OrderByDescending(x => x.PeriodTo)
            .Take(take)
            .ToListAsync(cancellationToken);
        return (await BuildReviewDtosAsync(reviews, cancellationToken))
            .OrderByDescending(x => x.PeriodTo)
            .ToArray();
    }

    public async Task<IReadOnlyCollection<RotaTimesheetReviewDto>> GetMyTimesheetReviewsAsync(Guid shopId, CancellationToken cancellationToken = default)
    {
        await EnsureStaffAsync(shopId, cancellationToken);
        var userId = CurrentUserId;
        // Everything still needing action, plus recently signed-off periods for reference.
        var recentCutoff = DateOnly.FromDateTime(DateTimeOffset.UtcNow.UtcDateTime).AddDays(-60);
        var reviews = await _timesheetReviewRepository.Query()
            .AsNoTracking()
            .Include(x => x.User)
            .Where(x => x.ShopId == shopId && x.UserId == userId
                && (x.Status != RotaTimesheetReviewStatus.ManagerApproved || x.PeriodTo >= recentCutoff))
            .ToListAsync(cancellationToken);
        return await BuildReviewDtosAsync(reviews, cancellationToken);
    }

    public async Task<IReadOnlyCollection<TimesheetSessionDto>> GetMyTimesheetReviewSessionsAsync(Guid reviewId, CancellationToken cancellationToken = default)
    {
        var review = await GetReviewAsync(reviewId, cancellationToken);
        await EnsureStaffAsync(review.ShopId, cancellationToken);
        if (review.UserId != CurrentUserId)
        {
            throw new AppException("rota_review_not_yours", "You can only view your own timesheet.", 403);
        }
        // Same period bounding as the review's total hours (sessions by check-in date within the period).
        return await QueryStaffSessionsAsync(review.ShopId, review.UserId, null, review.PeriodFrom, review.PeriodTo, cancellationToken);
    }

    public async Task<RotaTimesheetReviewDto> ConfirmTimesheetReviewAsync(Guid reviewId, CancellationToken cancellationToken = default)
    {
        var review = await GetReviewAsync(reviewId, cancellationToken);
        await EnsureStaffAsync(review.ShopId, cancellationToken);
        if (review.UserId != CurrentUserId)
        {
            throw new AppException("rota_review_not_yours", "You can only confirm your own timesheet.", 403);
        }
        if (review.Status is not (RotaTimesheetReviewStatus.PendingStaff or RotaTimesheetReviewStatus.Disputed))
        {
            throw new AppException("rota_review_invalid_status", "This timesheet review can no longer be confirmed.");
        }
        await EnsureReviewPeriodNotLockedAsync(review.ShopId, review.PeriodTo, cancellationToken);

        var now = DateTimeOffset.UtcNow;
        review.Status = RotaTimesheetReviewStatus.Confirmed;
        review.ConfirmedOn = now;
        review.ModifiedOn = now;
        review.ModifiedBy = _currentUserService.UserId;
        _timesheetReviewRepository.Update(review);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        // Milestone push: tell managers once the last outstanding review for the period is confirmed (best-effort).
        try
        {
            var anyOutstanding = await _timesheetReviewRepository.Query()
                .AsNoTracking()
                .AnyAsync(x => x.ShopId == review.ShopId && x.PeriodFrom == review.PeriodFrom && x.PeriodTo == review.PeriodTo
                    && (x.Status == RotaTimesheetReviewStatus.PendingStaff || x.Status == RotaTimesheetReviewStatus.Disputed),
                    cancellationToken);
            if (!anyOutstanding)
            {
                await NotifyManagersAsync(review.ShopId, NotificationType.TimesheetAllConfirmed,
                    "Timesheets confirmed",
                    $"All staff have confirmed their hours for {review.PeriodFrom:d MMM}–{review.PeriodTo:d MMM yyyy} — ready to approve and lock.",
                    review.Id, cancellationToken);
            }
        }
        catch
        {
            // Notification failures must not block the review workflow.
        }
        return await MapReviewWithHoursAsync(review, cancellationToken);
    }

    public async Task<RotaTimesheetReviewDto> DisputeTimesheetReviewAsync(Guid reviewId, DisputeTimesheetReviewRequest request, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.Note))
        {
            throw new AppException("rota_review_note_required", "Describe what's wrong with your hours.");
        }
        if (request.Note.Trim().Length > 500)
        {
            throw new AppException("rota_review_note_too_long", "Keep the note under 500 characters.");
        }
        var review = await GetReviewAsync(reviewId, cancellationToken);
        await EnsureStaffAsync(review.ShopId, cancellationToken);
        if (review.UserId != CurrentUserId)
        {
            throw new AppException("rota_review_not_yours", "You can only raise an issue on your own timesheet.", 403);
        }
        if (review.Status is not (RotaTimesheetReviewStatus.PendingStaff or RotaTimesheetReviewStatus.Confirmed))
        {
            throw new AppException("rota_review_invalid_status", "An issue can no longer be raised on this timesheet review.");
        }
        await EnsureReviewPeriodNotLockedAsync(review.ShopId, review.PeriodTo, cancellationToken);

        var now = DateTimeOffset.UtcNow;
        review.Status = RotaTimesheetReviewStatus.Disputed;
        review.StaffNote = request.Note.Trim();
        review.ConfirmedOn = null;
        review.ModifiedOn = now;
        review.ModifiedBy = _currentUserService.UserId;
        _timesheetReviewRepository.Update(review);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await NotifyManagersAsync(review.ShopId, NotificationType.TimesheetIssueRaised,
            "Timesheet issue raised",
            $"{_currentUserService.FullName} raised a timesheet issue for {review.PeriodFrom:d MMM}–{review.PeriodTo:d MMM yyyy}.",
            review.Id, cancellationToken);
        return await MapReviewWithHoursAsync(review, cancellationToken);
    }

    public async Task<RotaTimesheetReviewDto> ResolveTimesheetReviewAsync(Guid reviewId, ResolveTimesheetReviewRequest request, CancellationToken cancellationToken = default)
    {
        var review = await GetReviewAsync(reviewId, cancellationToken);
        await EnsureManageAsync(review.ShopId, cancellationToken);
        if (review.Status != RotaTimesheetReviewStatus.Disputed)
        {
            throw new AppException("rota_review_not_disputed", "Only a timesheet review with an open issue can be resolved.");
        }
        await EnsureReviewPeriodNotLockedAsync(review.ShopId, review.PeriodTo, cancellationToken);

        var now = DateTimeOffset.UtcNow;
        // Manager fixed the times → send back for re-confirmation; otherwise the resolution is final.
        review.Status = request.ReRequestConfirmation
            ? RotaTimesheetReviewStatus.PendingStaff
            : RotaTimesheetReviewStatus.ManagerApproved;
        if (request.ReRequestConfirmation)
        {
            review.ConfirmedOn = null;
        }
        review.ManagerNote = string.IsNullOrWhiteSpace(request.ManagerNote) ? null : request.ManagerNote.Trim();
        review.ResolvedByUserId = CurrentUserId;
        review.ResolvedOn = now;
        review.ModifiedOn = now;
        review.ModifiedBy = _currentUserService.UserId;
        _timesheetReviewRepository.Update(review);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        var periodLabel = $"{review.PeriodFrom:d MMM}–{review.PeriodTo:d MMM yyyy}";
        var body = request.ReRequestConfirmation
            ? $"Your timesheet issue for {periodLabel} was reviewed and your hours were updated. Please re-confirm them in the app."
            : request.Approved
                ? $"Your timesheet issue for {periodLabel} was resolved and your hours were approved."
                : $"Your timesheet issue for {periodLabel} was reviewed and not upheld; your hours were approved as recorded.";
        await NotifyUsersAsync(review.ShopId, [review.UserId], NotificationType.TimesheetReviewResolved,
            "Timesheet issue resolved", body, review.Id, cancellationToken);
        return await MapReviewWithHoursAsync(review, cancellationToken);
    }

    public async Task<RotaTimesheetReviewDto> ApproveTimesheetReviewAsync(Guid reviewId, CancellationToken cancellationToken = default)
    {
        var review = await GetReviewAsync(reviewId, cancellationToken);
        await EnsureManageAsync(review.ShopId, cancellationToken);
        // Covers both normal approval (after staff confirm) and override of an unresponsive member.
        if (review.Status is not (RotaTimesheetReviewStatus.PendingStaff or RotaTimesheetReviewStatus.Confirmed))
        {
            throw new AppException("rota_review_invalid_status",
                "Only a pending or confirmed review can be approved. Resolve the open issue first.");
        }
        await EnsureReviewPeriodNotLockedAsync(review.ShopId, review.PeriodTo, cancellationToken);

        // A still-pending row means the member never confirmed — this approval is a manager override.
        var wasManagerOverride = review.Status == RotaTimesheetReviewStatus.PendingStaff;

        var now = DateTimeOffset.UtcNow;
        review.Status = RotaTimesheetReviewStatus.ManagerApproved;
        review.ResolvedByUserId = CurrentUserId;
        review.ResolvedOn = now;
        review.ModifiedOn = now;
        review.ModifiedBy = _currentUserService.UserId;
        _timesheetReviewRepository.Update(review);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        if (wasManagerOverride)
        {
            await NotifyUsersAsync(review.ShopId, [review.UserId], NotificationType.TimesheetApproved,
                "Hours approved",
                $"Your hours for {review.PeriodFrom:d MMM}–{review.PeriodTo:d MMM yyyy} were approved by your manager.",
                review.Id, cancellationToken);
        }
        return await MapReviewWithHoursAsync(review, cancellationToken);
    }

    public async Task<IReadOnlyCollection<AttendanceApprovalRowDto>> GetPendingApprovalsAsync(Guid shopId, CancellationToken cancellationToken = default)
    {
        await EnsureManageAsync(shopId, cancellationToken, FeatureKeys.StaffRotaManualApproval);
        var rows = await _attendanceRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && !x.IsApproved)
            .OrderBy(x => x.CheckInAt)
            .Select(x => new
            {
                x.Id,
                x.UserId,
                FirstName = x.User != null ? x.User.FirstName : null,
                LastName = x.User != null ? x.User.LastName : null,
                x.CheckInAt,
                x.CheckOutAt,
                x.EntryMethod,
                x.CreatedOn,
                x.Notes,
                x.RotaShiftId,
            })
            .ToListAsync(cancellationToken);

        var shiftIds = rows.Where(r => r.RotaShiftId != null).Select(r => r.RotaShiftId!.Value).Distinct().ToList();
        var shiftInfo = await _shiftRepository.Query()
            .AsNoTracking()
            .Where(x => shiftIds.Contains(x.Id))
            .Select(x => new { x.Id, x.ShiftName, x.ShiftDate, x.EndDate, x.StartTime, x.EndTime })
            .ToDictionaryAsync(x => x.Id, cancellationToken);

        return rows.Select(r =>
        {
            shiftInfo.TryGetValue(r.RotaShiftId ?? Guid.Empty, out var s);
            return new AttendanceApprovalRowDto
            {
                Id = r.Id,
                UserId = r.UserId,
                UserName = $"{r.FirstName} {r.LastName}".Trim(),
                ShiftName = s?.ShiftName,
                ShiftDate = s?.ShiftDate,
                ShiftEndDate = s?.EndDate,
                ShiftStart = s?.StartTime,
                ShiftEnd = s?.EndTime,
                CheckInAt = r.CheckInAt,
                CheckOutAt = r.CheckOutAt,
                EntryMethod = r.EntryMethod.ToString(),
                SubmittedOn = r.CreatedOn,
                Notes = r.Notes,
            };
        }).ToArray();
    }

    private static string AttendanceName(ShiftAttendance a) =>
        a.User != null ? $"{a.User.FirstName} {a.User.LastName}".Trim() : (a.RotaStaffMember?.Name ?? "—");

    public async Task<ShiftAttendanceDto> ApproveAttendanceAsync(Guid attendanceId, CancellationToken cancellationToken = default)
    {
        var attendance = await _attendanceRepository.Query()
            .Include(x => x.User)
            .Include(x => x.RotaStaffMember)
            .FirstOrDefaultAsync(x => x.Id == attendanceId, cancellationToken)
            ?? throw new AppException("rota_attendance_not_found", "Attendance record not found.", 404);
        await EnsureManageAsync(attendance.ShopId, cancellationToken, FeatureKeys.StaffRotaManualApproval);
        await EnsureAttendanceNotLockedAsync(attendance.ShopId, attendance.CheckInAt, cancellationToken);

        var now = DateTimeOffset.UtcNow;
        attendance.IsApproved = true;
        attendance.ApprovedByUserId = _currentUserService.UserId;
        attendance.ApprovedOn = now;
        attendance.ModifiedOn = now;
        attendance.ModifiedBy = _currentUserService.UserId;
        _attendanceRepository.Update(attendance);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        // Newly counted hours invalidate any sign-off already covering that day.
        await ResetSignedOffReviewsAsync(attendance.ShopId, attendance.UserId, [attendance.CheckInAt], cancellationToken);

        return MapAttendance(attendance, AttendanceName(attendance));
    }

    public async Task<ShiftAttendanceDto> UpdateAttendanceAsync(Guid attendanceId, UpdateAttendanceRequest request, CancellationToken cancellationToken = default)
    {
        var attendance = await _attendanceRepository.Query()
            .Include(x => x.User)
            .Include(x => x.RotaStaffMember)
            .FirstOrDefaultAsync(x => x.Id == attendanceId, cancellationToken)
            ?? throw new AppException("rota_attendance_not_found", "Attendance record not found.", 404);
        await EnsureManageAsync(attendance.ShopId, cancellationToken, FeatureKeys.StaffRotaManualApproval);

        if (request.CheckOutAt is DateTimeOffset outAt && outAt <= request.CheckInAt)
        {
            throw new AppException("rota_invalid_times", "Check-out time must be after check-in time.");
        }

        // Neither edit a session inside the payroll lock nor move one into it.
        await EnsureAttendanceNotLockedAsync(attendance.ShopId, attendance.CheckInAt, cancellationToken);
        await EnsureAttendanceNotLockedAsync(attendance.ShopId, request.CheckInAt, cancellationToken);

        var previousCheckInAt = attendance.CheckInAt;
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

        // Manager-edited hours invalidate any sign-off covering the old or new day.
        await ResetSignedOffReviewsAsync(attendance.ShopId, attendance.UserId,
            [previousCheckInAt, request.CheckInAt], cancellationToken);

        return MapAttendance(attendance, AttendanceName(attendance));
    }

    public async Task RejectAttendanceAsync(Guid attendanceId, CancellationToken cancellationToken = default)
    {
        var attendance = await _attendanceRepository.Query()
            .FirstOrDefaultAsync(x => x.Id == attendanceId, cancellationToken)
            ?? throw new AppException("rota_attendance_not_found", "Attendance record not found.", 404);
        await EnsureManageAsync(attendance.ShopId, cancellationToken, FeatureKeys.StaffRotaManualApproval);
        await EnsureAttendanceNotLockedAsync(attendance.ShopId, attendance.CheckInAt, cancellationToken);

        var wasCounted = attendance.IsApproved;
        var ownerUserId = attendance.UserId;
        var checkInAt = attendance.CheckInAt;
        var shopId = attendance.ShopId;

        // Reject = discard the (manual) entry entirely.
        _attendanceRepository.Remove(attendance);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        if (wasCounted)
        {
            // Deleting hours that already counted invalidates any sign-off covering them.
            await ResetSignedOffReviewsAsync(shopId, ownerUserId, [checkInAt], cancellationToken);
        }
    }

    private async Task<RotaShiftDto> GetShiftByIdAsync(Guid shiftId, CancellationToken cancellationToken)
    {
        var shift = await _shiftRepository.Query()
            .AsNoTracking()
            .Include(x => x.Assignments).ThenInclude(a => a.User)
            .Include(x => x.Assignments).ThenInclude(a => a.RotaStaffMember)
            .FirstAsync(x => x.Id == shiftId, cancellationToken);
        return MapShift(shift);
    }
}
