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

    // Two shift windows on the same day overlap (overnight windows extend past midnight).
    private static bool Overlaps(TimeOnly aStart, TimeOnly aEnd, TimeOnly bStart, TimeOnly bEnd)
    {
        int aS = Minutes(aStart), aE = Minutes(aEnd); if (aE <= aS) aE += 1440;
        int bS = Minutes(bStart), bE = Minutes(bEnd); if (bE <= bS) bE += 1440;
        return aS < bE && bS < aE;
    }

    // A shop can't have a duplicate (same shift template) or a time-overlapping rota shift on the same day.
    private async Task EnsureNoShiftConflictAsync(
        Guid shopId, DateOnly date, string templateId, TimeOnly start, TimeOnly end, Guid? excludeShiftId, CancellationToken cancellationToken)
    {
        var sameDay = await _shiftRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && !x.IsDeleted && x.ShiftDate == date && (excludeShiftId == null || x.Id != excludeShiftId))
            .Select(x => new { x.ShiftTemplateId, x.ShiftName, x.StartTime, x.EndTime })
            .ToListAsync(cancellationToken);

        if (sameDay.Any(x => string.Equals(x.ShiftTemplateId, templateId, StringComparison.OrdinalIgnoreCase)))
        {
            throw new AppException("rota_duplicate_shift", "That shift is already on the rota for this day.");
        }

        var clash = sameDay.FirstOrDefault(x => Overlaps(start, end, x.StartTime, x.EndTime));
        if (clash is not null)
        {
            throw new AppException("rota_overlapping_shift",
                $"This time overlaps the {clash.ShiftName} shift ({clash.StartTime:HH:mm}–{clash.EndTime:HH:mm}) on this day.");
        }
    }

    public async Task<RotaShiftDto> CreateShiftAsync(CreateRotaShiftRequest request, CancellationToken cancellationToken = default)
    {
        await EnsureManageAsync(request.ShopId, cancellationToken);
        var template = await ResolveTemplateAsync(request.ShopId, request.ShiftTemplateId, cancellationToken);
        await EnsureNoShiftConflictAsync(request.ShopId, request.ShiftDate, template.TemplateId,
            TimeOnly.FromTimeSpan(template.StartTime), TimeOnly.FromTimeSpan(template.EndTime), null, cancellationToken);

        var now = DateTimeOffset.UtcNow;
        var startTime = TimeOnly.FromTimeSpan(template.StartTime);
        var endTime = TimeOnly.FromTimeSpan(template.EndTime);
        var shift = new RotaShift
        {
            ShopId = request.ShopId,
            ShiftDate = request.ShiftDate,
            EndDate = ResolveEndDate(request.ShiftDate, startTime, endTime),
            BusinessDayId = await ResolveBusinessDayIdAsync(request.ShopId, request.ShiftDate, cancellationToken),
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

        foreach (var memberId in request.AssigneeStaffMemberIds.Distinct())
        {
            await _assignmentRepository.AddAsync(new ShiftAssignment
            {
                RotaShiftId = shift.Id,
                ShopId = request.ShopId,
                RotaStaffMemberId = memberId,
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
                    BusinessDayId = await ResolveBusinessDayIdAsync(shopId, date, cancellationToken),
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
        await EnsureNoShiftConflictAsync(shift.ShopId, request.ShiftDate, template.TemplateId,
            TimeOnly.FromTimeSpan(template.StartTime), TimeOnly.FromTimeSpan(template.EndTime), shiftId, cancellationToken);

        var now = DateTimeOffset.UtcNow;
        shift.ShiftDate = request.ShiftDate;
        shift.StartTime = TimeOnly.FromTimeSpan(template.StartTime);
        shift.EndTime = TimeOnly.FromTimeSpan(template.EndTime);
        shift.EndDate = ResolveEndDate(request.ShiftDate, shift.StartTime, shift.EndTime);
        shift.BusinessDayId = await ResolveBusinessDayIdAsync(shift.ShopId, request.ShiftDate, cancellationToken);
        shift.ShiftTemplateId = template.TemplateId;
        shift.ShiftName = template.Name;
        shift.Position = string.IsNullOrWhiteSpace(request.Position) ? null : request.Position.Trim();
        shift.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
        shift.ModifiedOn = now;
        shift.ModifiedBy = _currentUserService.UserId;
        _shiftRepository.Update(shift);

        var desiredUsers = request.AssigneeUserIds.Distinct().ToHashSet();
        var desiredMembers = request.AssigneeStaffMemberIds.Distinct().ToHashSet();
        var current = shift.Assignments.ToList();

        // Remove assignments no longer wanted (registered users + roster members).
        foreach (var existing in current.Where(a =>
            (a.UserId != null && !desiredUsers.Contains(a.UserId.Value)) ||
            (a.RotaStaffMemberId != null && !desiredMembers.Contains(a.RotaStaffMemberId.Value))))
        {
            _assignmentRepository.Remove(existing);
        }

        var currentUserIds = current.Where(a => a.UserId != null).Select(a => a.UserId!.Value).ToHashSet();
        foreach (var userId in desiredUsers.Where(id => !currentUserIds.Contains(id)))
        {
            await _assignmentRepository.AddAsync(new ShiftAssignment
            {
                RotaShiftId = shift.Id, ShopId = shift.ShopId, UserId = userId,
                CreatedOn = now, CreatedBy = _currentUserService.UserId,
            }, cancellationToken);
        }

        var currentMemberIds = current.Where(a => a.RotaStaffMemberId != null).Select(a => a.RotaStaffMemberId!.Value).ToHashSet();
        foreach (var memberId in desiredMembers.Where(id => !currentMemberIds.Contains(id)))
        {
            await _assignmentRepository.AddAsync(new ShiftAssignment
            {
                RotaShiftId = shift.Id, ShopId = shift.ShopId, RotaStaffMemberId = memberId,
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
            })
            .ToListAsync(cancellationToken);

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

        return rows
            .GroupBy(x => x.UserId != null ? $"u:{x.UserId}" : $"m:{x.RotaStaffMemberId}")
            .Select(g =>
            {
                var sample = g.First();
                var completed = g.Where(x => x.CheckOutAt != null).ToList();
                decimal? cost = null;
                if (showCost)
                {
                    cost = 0;
                    foreach (var s in completed)
                    {
                        var hours = (decimal)(s.CheckOutAt!.Value - s.CheckInAt).TotalHours;
                        var rate = RateOn(s.UserId, s.RotaStaffMemberId, DateOnly.FromDateTime(s.CheckInAt.UtcDateTime));
                        cost += hours * (rate ?? 0);
                    }
                    cost = Math.Round(cost.Value, 2);
                }
                return new TimesheetRowDto
                {
                    UserId = sample.UserId,
                    RotaStaffMemberId = sample.RotaStaffMemberId,
                    IsExternal = sample.RotaStaffMemberId != null,
                    UserName = (sample.UserId != null ? $"{sample.UserFirstName} {sample.UserLastName}" : sample.MemberName ?? "—").Trim(),
                    ShiftsWorked = completed.Count,
                    OpenSessions = g.Count(x => x.CheckOutAt == null),
                    TotalHours = Math.Round((decimal)completed.Sum(x => (x.CheckOutAt!.Value - x.CheckInAt).TotalHours), 2),
                    HourlyRate = showCost ? RateOn(sample.UserId, sample.RotaStaffMemberId, to) : null,
                    LabourCost = cost,
                };
            })
            .OrderBy(x => x.UserName)
            .ToArray();
    }

    public async Task<IReadOnlyCollection<ShiftTimesheetRowDto>> GetShiftTimesheetAsync(Guid shopId, DateOnly from, DateOnly to, CancellationToken cancellationToken = default)
    {
        await EnsureManageAsync(shopId, cancellationToken);
        var fromBound = new DateTimeOffset(from.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        var toExclusive = new DateTimeOffset(to.AddDays(1).ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);

        var rows = await _attendanceRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && x.CheckInAt >= fromBound && x.CheckInAt < toExclusive)
            .Select(x => new { x.UserId, x.RotaStaffMemberId, x.CheckInAt, x.CheckOutAt, x.RotaShiftId })
            .ToListAsync(cancellationToken);

        var shiftIds = rows.Where(r => r.RotaShiftId != null).Select(r => r.RotaShiftId!.Value).Distinct().ToList();
        var infoById = (await _shiftRepository.Query()
            .AsNoTracking()
            .Where(x => shiftIds.Contains(x.Id))
            .Select(x => new { x.Id, x.ShiftName, x.ShiftDate, x.StartTime, x.EndTime })
            .ToListAsync(cancellationToken))
            .ToDictionary(x => x.Id, x => x);

        // One row per shift instance (a specific day's shift), plus per-day rows for unrostered clock-ins.
        var rostered = rows
            .Where(r => r.RotaShiftId != null && infoById.ContainsKey(r.RotaShiftId!.Value))
            .GroupBy(r => r.RotaShiftId!.Value)
            .Select(g =>
            {
                var info = infoById[g.Key];
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
                };
            });

        var unrostered = rows
            .Where(r => r.RotaShiftId == null || !infoById.ContainsKey(r.RotaShiftId.Value))
            .GroupBy(r => DateOnly.FromDateTime(r.CheckInAt.UtcDateTime))
            .Select(g => new ShiftTimesheetRowDto
            {
                ShiftName = "Unrostered",
                Date = g.Key,
                StaffCount = g.Select(x => x.UserId).Distinct().Count(),
                ShiftsWorked = g.Count(x => x.CheckOutAt != null),
                OpenSessions = g.Count(x => x.CheckOutAt == null),
                TotalHours = Math.Round((decimal)g.Where(x => x.CheckOutAt != null).Sum(x => (x.CheckOutAt!.Value - x.CheckInAt).TotalHours), 2),
            });

        return rostered.Concat(unrostered)
            .OrderByDescending(x => x.Date)
            .ThenBy(x => x.StartTime ?? TimeOnly.MaxValue)
            .ToArray();
    }

    public async Task<IReadOnlyCollection<TimesheetSessionDto>> GetStaffSessionsAsync(Guid shopId, Guid? userId, Guid? rotaStaffMemberId, DateOnly from, DateOnly to, CancellationToken cancellationToken = default)
    {
        await EnsureManageAsync(shopId, cancellationToken);
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

        return rows.Select(r => new TimesheetSessionDto
        {
            Id = r.Id,
            Date = DateOnly.FromDateTime(r.CheckInAt.UtcDateTime),
            ShiftName = r.RotaShiftId != null && nameById.TryGetValue(r.RotaShiftId.Value, out var n) ? n : null,
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
            })
            .ToListAsync(cancellationToken);

        return rows.Select(r => new ShiftSessionDto
        {
            Id = r.Id,
            Date = DateOnly.FromDateTime(r.CheckInAt.UtcDateTime),
            UserId = r.UserId,
            RotaStaffMemberId = r.RotaStaffMemberId,
            IsExternal = r.RotaStaffMemberId != null,
            UserName = (r.UserId != null ? $"{r.UserFirstName} {r.UserLastName}" : r.MemberName ?? "—").Trim(),
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

        // Rostered: assignees of this date's shifts (their shift name + times).
        var shifts = await _shiftRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && !x.IsDeleted && x.ShiftDate == date)
            .Include(x => x.Assignments).ThenInclude(a => a.User)
            .Include(x => x.Assignments).ThenInclude(a => a.RotaStaffMember)
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

        await EnsureStaffAsync(request.ShopId, cancellationToken, FeatureKeys.StaffRotaManualApproval);
        var userId = CurrentUserId;

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

        var now = DateTimeOffset.UtcNow;
        attendance.IsApproved = true;
        attendance.ApprovedByUserId = _currentUserService.UserId;
        attendance.ApprovedOn = now;
        attendance.ModifiedOn = now;
        attendance.ModifiedBy = _currentUserService.UserId;
        _attendanceRepository.Update(attendance);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
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
        return MapAttendance(attendance, AttendanceName(attendance));
    }

    public async Task RejectAttendanceAsync(Guid attendanceId, CancellationToken cancellationToken = default)
    {
        var attendance = await _attendanceRepository.Query()
            .FirstOrDefaultAsync(x => x.Id == attendanceId, cancellationToken)
            ?? throw new AppException("rota_attendance_not_found", "Attendance record not found.", 404);
        await EnsureManageAsync(attendance.ShopId, cancellationToken, FeatureKeys.StaffRotaManualApproval);

        // Reject = discard the (manual) entry entirely.
        _attendanceRepository.Remove(attendance);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
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
