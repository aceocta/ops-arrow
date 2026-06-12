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

/// <summary>
/// Leave management (holiday / sick / unpaid / other): staff requests, manager decisions,
/// entitlements and balances. Gated on the LeaveManagement module feature — independent of
/// StaffRota, though it shares the rota's people model (registered users + roster-only members)
/// and respects the rota payroll lock for anything that changes approved leave.
/// </summary>
public class LeaveService : ILeaveService
{
    private static readonly string[] ManagementRoles = [RoleNames.CompanyOwner, RoleNames.Manager];
    private static readonly string[] StaffRoles =
        [RoleNames.CompanyOwner, RoleNames.Manager, RoleNames.Cashier, RoleNames.SalesAssistant];

    private readonly IRepository<LeaveRequest> _leaveRepository;
    private readonly IRepository<StaffLeaveEntitlement> _entitlementRepository;
    private readonly IRepository<RotaStaffMember> _staffMemberRepository;
    private readonly IRepository<ShopUser> _shopUserRepository;
    private readonly IRepository<RotaTimesheetLock> _timesheetLockRepository;
    private readonly IRepository<UserPushToken> _pushTokenRepository;
    private readonly IShopMembershipService _shopMembershipService;
    private readonly IFeatureGateService _featureGateService;
    private readonly INotificationService _notificationService;
    private readonly ICurrentUserService _currentUserService;
    private readonly IUnitOfWork _unitOfWork;

    public LeaveService(
        IRepository<LeaveRequest> leaveRepository,
        IRepository<StaffLeaveEntitlement> entitlementRepository,
        IRepository<RotaStaffMember> staffMemberRepository,
        IRepository<ShopUser> shopUserRepository,
        IRepository<RotaTimesheetLock> timesheetLockRepository,
        IRepository<UserPushToken> pushTokenRepository,
        IShopMembershipService shopMembershipService,
        IFeatureGateService featureGateService,
        INotificationService notificationService,
        ICurrentUserService currentUserService,
        IUnitOfWork unitOfWork)
    {
        _leaveRepository = leaveRepository;
        _entitlementRepository = entitlementRepository;
        _staffMemberRepository = staffMemberRepository;
        _shopUserRepository = shopUserRepository;
        _timesheetLockRepository = timesheetLockRepository;
        _pushTokenRepository = pushTokenRepository;
        _shopMembershipService = shopMembershipService;
        _featureGateService = featureGateService;
        _notificationService = notificationService;
        _currentUserService = currentUserService;
        _unitOfWork = unitOfWork;
    }

    // Role + subscription-feature gates. Management = CompanyOwner/Manager; staff = operational roles.
    private async Task EnsureManageAsync(Guid shopId, CancellationToken ct)
    {
        await _shopMembershipService.EnsureCurrentUserShopRoleAsync(shopId, ManagementRoles, ct);
        await _featureGateService.EnsureFeatureAsync(shopId, FeatureKeys.LeaveManagement, ct);
    }

    private async Task EnsureStaffAsync(Guid shopId, CancellationToken ct)
    {
        await _shopMembershipService.EnsureCurrentUserShopRoleAsync(shopId, StaffRoles, ct);
        await _featureGateService.EnsureFeatureAsync(shopId, FeatureKeys.LeaveManagement, ct);
    }

    private Guid CurrentUserId =>
        _currentUserService.UserId ?? throw new AppException("unauthorized", "No authenticated user.", 401);

    private static string FullName(User user) => $"{user.FirstName} {user.LastName}".Trim();

    // "12–16 Jun 2026" (or "12 Jun 2026" for a single day) — used in notification bodies.
    private static string DateRangeLabel(DateOnly start, DateOnly end) =>
        start == end ? $"{start:d MMM yyyy}"
        : start.Year == end.Year && start.Month == end.Month ? $"{start.Day}–{end:d MMM yyyy}"
        : $"{start:d MMM}–{end:d MMM yyyy}";

    // Inclusive day count of the overlap between [start, end] and [from, to] (0 when disjoint).
    private static int OverlapDays(DateOnly start, DateOnly end, DateOnly from, DateOnly to)
    {
        var s = start > from ? start : from;
        var e = end < to ? end : to;
        return e < s ? 0 : e.DayNumber - s.DayNumber + 1;
    }

    private static string? NormalizeNote(string? note, string errorCode)
    {
        var trimmed = note?.Trim();
        if (string.IsNullOrEmpty(trimmed)) return null;
        if (trimmed.Length > 500)
        {
            throw new AppException(errorCode, "Keep the note under 500 characters.");
        }
        return trimmed;
    }

    private static void ValidateHoursPerDay(decimal hoursPerDay)
    {
        if (hoursPerDay < 0.5m || hoursPerDay > 24m)
        {
            throw new AppException("leave_invalid_hours", "Hours per day must be between 0.5 and 24.");
        }
    }

    // Holiday is paid by default; everything else (Sick / Unpaid / Other) starts unpaid —
    // a manager can flip Sick/Other to paid at approval.
    private static bool DefaultIsPaid(LeaveType type) => type == LeaveType.Holiday;

    // Leave whose dates fall on or before the shop's payroll lock is frozen — wages for that
    // period have been paid (see RotaTimesheetLock), so changes would silently drift payroll.
    private async Task EnsureLeaveNotLockedAsync(Guid shopId, DateOnly startDate, CancellationToken cancellationToken)
    {
        var lockedThrough = await _timesheetLockRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId)
            .Select(x => (DateOnly?)x.LockedThrough)
            .FirstOrDefaultAsync(cancellationToken);
        if (lockedThrough is DateOnly through && startDate <= through)
        {
            throw new AppException("rota_timesheet_locked",
                $"This period is locked for payroll (locked through {through:d MMM yyyy}). Unlock it in Timesheet before editing.");
        }
    }

    // No second non-rejected/cancelled booking may overlap the same person's dates.
    private async Task EnsureNoOverlapAsync(
        Guid shopId, Guid? userId, Guid? rotaStaffMemberId, DateOnly startDate, DateOnly endDate,
        Guid? excludeLeaveRequestId, CancellationToken cancellationToken)
    {
        var overlaps = await _leaveRepository.Query()
            .AsNoTracking()
            .AnyAsync(x => x.ShopId == shopId
                && (rotaStaffMemberId != null ? x.RotaStaffMemberId == rotaStaffMemberId : x.UserId == userId)
                && x.Status != LeaveRequestStatus.Rejected && x.Status != LeaveRequestStatus.Cancelled
                && x.StartDate <= endDate && x.EndDate >= startDate
                && (excludeLeaveRequestId == null || x.Id != excludeLeaveRequestId),
                cancellationToken);
        if (overlaps)
        {
            throw new AppException("leave_overlapping", "This person already has leave booked that overlaps these dates.");
        }
    }

    // The person's display name: an active shop user (UserId) or a roster-only member
    // (RotaStaffMemberId). Throws when they don't belong to the shop.
    private async Task<string> ResolvePersonNameAsync(Guid shopId, Guid? userId, Guid? rotaStaffMemberId, CancellationToken cancellationToken)
    {
        if (rotaStaffMemberId is Guid memberId)
        {
            return await _staffMemberRepository.Query()
                .AsNoTracking()
                .Where(x => x.Id == memberId && x.ShopId == shopId && !x.IsDeleted)
                .Select(x => x.Name)
                .FirstOrDefaultAsync(cancellationToken)
                ?? throw new AppException("leave_person_not_found", "Staff member not found.", 404);
        }
        var name = await _shopUserRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && x.UserId == userId && x.IsActive)
            .Select(x => x.User.FirstName + " " + x.User.LastName)
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new AppException("leave_person_not_found", "Staff member not found.", 404);
        return name.Trim();
    }

    private static LeaveRequestDto MapLeave(LeaveRequest x, string userName)
    {
        var days = x.EndDate.DayNumber - x.StartDate.DayNumber + 1;
        return new LeaveRequestDto
        {
            Id = x.Id,
            ShopId = x.ShopId,
            UserId = x.UserId,
            RotaStaffMemberId = x.RotaStaffMemberId,
            IsExternal = x.RotaStaffMemberId != null,
            UserName = userName,
            Type = x.Type.ToString(),
            StartDate = x.StartDate,
            EndDate = x.EndDate,
            HoursPerDay = x.HoursPerDay,
            TotalDays = days,
            TotalHours = Math.Round(days * x.HoursPerDay, 2),
            IsPaid = x.IsPaid,
            Status = x.Status.ToString(),
            StaffNote = x.StaffNote,
            ManagerNote = x.ManagerNote,
            DecidedByUserId = x.DecidedByUserId,
            DecidedOn = x.DecidedOn,
            RequestedOn = x.CreatedOn,
        };
    }

    private static string LeaveName(LeaveRequest x) =>
        x.User != null ? FullName(x.User) : (x.RotaStaffMember?.Name ?? "—");

    private async Task<LeaveRequest> GetLeaveAsync(Guid leaveRequestId, CancellationToken cancellationToken) =>
        await _leaveRepository.Query()
            .Include(x => x.User)
            .Include(x => x.RotaStaffMember)
            .FirstOrDefaultAsync(x => x.Id == leaveRequestId, cancellationToken)
            ?? throw new AppException("leave_not_found", "Leave request not found.", 404);

    public async Task<LeaveRequestDto> CreateAsync(CreateLeaveRequest request, CancellationToken cancellationToken = default)
    {
        if (!Enum.IsDefined(request.Type))
        {
            throw new AppException("leave_invalid_type", "Pick a valid leave type.");
        }
        if (request.EndDate < request.StartDate)
        {
            throw new AppException("leave_invalid_dates", "The leave end date must be on or after its start date.");
        }
        ValidateHoursPerDay(request.HoursPerDay);
        var staffNote = NormalizeNote(request.StaffNote, "leave_note_too_long");

        if (request.UserId != null && request.RotaStaffMemberId != null)
        {
            throw new AppException("leave_person_invalid", "Pick either a user or a roster staff member (not both).");
        }

        // A manager recording leave on someone's behalf (auto-approved, manager-authoritative).
        if (request.RotaStaffMemberId is not null || (request.UserId is Guid target && target != CurrentUserId))
        {
            return await CreateOnBehalfAsync(request, staffNote, cancellationToken);
        }

        // A staff member's own request — created Pending for a manager to decide.
        await EnsureStaffAsync(request.ShopId, cancellationToken);
        var userId = CurrentUserId;
        await EnsureNoOverlapAsync(request.ShopId, userId, null, request.StartDate, request.EndDate, null, cancellationToken);

        var now = DateTimeOffset.UtcNow;
        var leave = new LeaveRequest
        {
            ShopId = request.ShopId,
            UserId = userId,
            Type = request.Type,
            StartDate = request.StartDate,
            EndDate = request.EndDate,
            HoursPerDay = request.HoursPerDay,
            IsPaid = DefaultIsPaid(request.Type),
            Status = LeaveRequestStatus.Pending,
            StaffNote = staffNote,
            CreatedOn = now,
            CreatedBy = userId,
        };
        await _leaveRepository.AddAsync(leave, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        var name = _currentUserService.FullName;
        // Privacy: never put the leave TYPE (Sick is health-adjacent) into push bodies — they
        // transit FCM and show on lock screens. The type stays in the API/app views.
        await NotifyManagersAsync(request.ShopId, NotificationType.LeaveRequested,
            "Leave requested",
            $"{name} requested leave · {DateRangeLabel(leave.StartDate, leave.EndDate)}.",
            leave.Id, cancellationToken);
        return MapLeave(leave, name);
    }

    // Manager records leave directly for a user or roster-only member — created Approved.
    private async Task<LeaveRequestDto> CreateOnBehalfAsync(CreateLeaveRequest request, string? staffNote, CancellationToken cancellationToken)
    {
        await EnsureManageAsync(request.ShopId, cancellationToken);
        var name = await ResolvePersonNameAsync(request.ShopId, request.UserId, request.RotaStaffMemberId, cancellationToken);
        // Creating already-approved leave inside the payroll lock would drift paid wages.
        await EnsureLeaveNotLockedAsync(request.ShopId, request.StartDate, cancellationToken);
        await EnsureNoOverlapAsync(request.ShopId, request.UserId, request.RotaStaffMemberId,
            request.StartDate, request.EndDate, null, cancellationToken);

        var now = DateTimeOffset.UtcNow;
        var leave = new LeaveRequest
        {
            ShopId = request.ShopId,
            UserId = request.UserId,
            RotaStaffMemberId = request.RotaStaffMemberId,
            Type = request.Type,
            StartDate = request.StartDate,
            EndDate = request.EndDate,
            HoursPerDay = request.HoursPerDay,
            IsPaid = DefaultIsPaid(request.Type),
            Status = LeaveRequestStatus.Approved,
            StaffNote = staffNote,
            DecidedByUserId = CurrentUserId,
            DecidedOn = now,
            CreatedOn = now,
            CreatedBy = _currentUserService.UserId,
        };
        await _leaveRepository.AddAsync(leave, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        // Roster-only members have no app login — only registered users get the push.
        if (request.UserId is Guid targetUserId)
        {
            await NotifyUsersAsync(request.ShopId, [targetUserId], NotificationType.LeaveDecided,
                "Leave recorded",
                $"Your leave for {DateRangeLabel(leave.StartDate, leave.EndDate)} was recorded by your manager.",
                leave.Id, cancellationToken);
        }
        return MapLeave(leave, name);
    }

    public async Task<IReadOnlyCollection<LeaveRequestDto>> GetForShopAsync(Guid shopId, DateOnly from, DateOnly to, CancellationToken cancellationToken = default)
    {
        await EnsureManageAsync(shopId, cancellationToken);
        var rows = await _leaveRepository.Query()
            .AsNoTracking()
            .Include(x => x.User)
            .Include(x => x.RotaStaffMember)
            .Where(x => x.ShopId == shopId && x.StartDate <= to && x.EndDate >= from)
            .OrderByDescending(x => x.CreatedOn)
            .ToListAsync(cancellationToken);
        return rows.Select(x => MapLeave(x, LeaveName(x))).ToArray();
    }

    public async Task<IReadOnlyCollection<LeaveRequestDto>> GetMineAsync(Guid shopId, CancellationToken cancellationToken = default)
    {
        await EnsureStaffAsync(shopId, cancellationToken);
        var userId = CurrentUserId;
        var rows = await _leaveRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && x.UserId == userId)
            .OrderByDescending(x => x.CreatedOn)
            .Take(100)
            .ToListAsync(cancellationToken);
        var name = _currentUserService.FullName;
        return rows.Select(x => MapLeave(x, name)).ToArray();
    }

    public async Task<LeaveRequestDto> ApproveAsync(Guid leaveRequestId, ApproveLeaveRequest request, CancellationToken cancellationToken = default)
    {
        var leave = await GetLeaveAsync(leaveRequestId, cancellationToken);
        await EnsureManageAsync(leave.ShopId, cancellationToken);
        if (leave.Status != LeaveRequestStatus.Pending)
        {
            throw new AppException("leave_invalid_status", "Only a pending leave request can be approved.");
        }
        await EnsureLeaveNotLockedAsync(leave.ShopId, leave.StartDate, cancellationToken);

        if (request.HoursPerDay is decimal hours)
        {
            ValidateHoursPerDay(hours);
            leave.HoursPerDay = hours;
        }
        if (request.IsPaid is bool isPaid)
        {
            leave.IsPaid = isPaid;
        }

        var now = DateTimeOffset.UtcNow;
        leave.Status = LeaveRequestStatus.Approved;
        leave.ManagerNote = NormalizeNote(request.ManagerNote, "leave_note_too_long");
        leave.DecidedByUserId = CurrentUserId;
        leave.DecidedOn = now;
        leave.ModifiedOn = now;
        leave.ModifiedBy = _currentUserService.UserId;
        _leaveRepository.Update(leave);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        if (leave.UserId is Guid userId)
        {
            await NotifyUsersAsync(leave.ShopId, [userId], NotificationType.LeaveDecided,
                "Leave approved",
                $"Your leave for {DateRangeLabel(leave.StartDate, leave.EndDate)} was approved.",
                leave.Id, cancellationToken);
        }
        return MapLeave(leave, LeaveName(leave));
    }

    public async Task<LeaveRequestDto> RejectAsync(Guid leaveRequestId, RejectLeaveRequest request, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.ManagerNote))
        {
            throw new AppException("leave_note_required", "Tell the staff member why the request was rejected.");
        }
        var managerNote = NormalizeNote(request.ManagerNote, "leave_note_too_long");

        var leave = await GetLeaveAsync(leaveRequestId, cancellationToken);
        await EnsureManageAsync(leave.ShopId, cancellationToken);
        if (leave.Status != LeaveRequestStatus.Pending)
        {
            throw new AppException("leave_invalid_status", "Only a pending leave request can be rejected.");
        }

        var now = DateTimeOffset.UtcNow;
        leave.Status = LeaveRequestStatus.Rejected;
        leave.ManagerNote = managerNote;
        leave.DecidedByUserId = CurrentUserId;
        leave.DecidedOn = now;
        leave.ModifiedOn = now;
        leave.ModifiedBy = _currentUserService.UserId;
        _leaveRepository.Update(leave);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        if (leave.UserId is Guid userId)
        {
            await NotifyUsersAsync(leave.ShopId, [userId], NotificationType.LeaveDecided,
                "Leave rejected",
                $"Your leave request for {DateRangeLabel(leave.StartDate, leave.EndDate)} was rejected.",
                leave.Id, cancellationToken);
        }
        return MapLeave(leave, LeaveName(leave));
    }

    public async Task<LeaveRequestDto> CancelAsync(Guid leaveRequestId, CancellationToken cancellationToken = default)
    {
        var leave = await GetLeaveAsync(leaveRequestId, cancellationToken);
        if (leave.Status is not (LeaveRequestStatus.Pending or LeaveRequestStatus.Approved))
        {
            throw new AppException("leave_invalid_status", "This leave request can no longer be cancelled.");
        }

        // Staff may withdraw their own request while it's still pending; anything else
        // (someone else's request, or already-approved leave) needs a manager.
        var isOwnPending = leave.UserId == CurrentUserId && leave.Status == LeaveRequestStatus.Pending;
        if (isOwnPending)
        {
            await EnsureStaffAsync(leave.ShopId, cancellationToken);
        }
        else
        {
            await EnsureManageAsync(leave.ShopId, cancellationToken);
        }
        await EnsureLeaveNotLockedAsync(leave.ShopId, leave.StartDate, cancellationToken);

        var now = DateTimeOffset.UtcNow;
        leave.Status = LeaveRequestStatus.Cancelled;
        leave.ModifiedOn = now;
        leave.ModifiedBy = _currentUserService.UserId;
        _leaveRepository.Update(leave);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        // Notify the other party: staff cancelling → managers; manager cancelling → the person (if internal).
        var rangeLabel = DateRangeLabel(leave.StartDate, leave.EndDate);
        if (leave.UserId == CurrentUserId)
        {
            await NotifyManagersAsync(leave.ShopId, NotificationType.LeaveRequested,
                "Leave cancelled",
                $"{_currentUserService.FullName} cancelled their leave request for {rangeLabel}.",
                leave.Id, cancellationToken);
        }
        else if (leave.UserId is Guid userId)
        {
            await NotifyUsersAsync(leave.ShopId, [userId], NotificationType.LeaveDecided,
                "Leave cancelled",
                $"Your leave for {rangeLabel} was cancelled by your manager.",
                leave.Id, cancellationToken);
        }
        return MapLeave(leave, LeaveName(leave));
    }

    public async Task<LeaveBalanceDto?> GetBalanceAsync(Guid shopId, Guid? userId, Guid? rotaStaffMemberId, CancellationToken cancellationToken = default)
    {
        if (userId != null && rotaStaffMemberId != null)
        {
            throw new AppException("leave_person_invalid", "Pick either a user or a roster staff member (not both).");
        }
        // Staff can read their own balance; anyone else's requires manage.
        if (rotaStaffMemberId is null && (userId is null || userId == _currentUserService.UserId))
        {
            await EnsureStaffAsync(shopId, cancellationToken);
            userId ??= CurrentUserId;
        }
        else
        {
            await EnsureManageAsync(shopId, cancellationToken);
        }

        var today = DateOnly.FromDateTime(DateTimeOffset.UtcNow.UtcDateTime);
        var entitlement = await _entitlementRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId
                && (rotaStaffMemberId != null ? x.RotaStaffMemberId == rotaStaffMemberId : x.UserId == userId)
                && x.YearStart <= today)
            .OrderByDescending(x => x.YearStart)
            .FirstOrDefaultAsync(cancellationToken);
        // No entitlement whose year window (YearStart..+1y) covers today → no balance to show.
        if (entitlement is null || today >= entitlement.YearStart.AddYears(1))
        {
            return null;
        }

        var yearStart = entitlement.YearStart;
        var yearEnd = yearStart.AddYears(1).AddDays(-1);
        var holidays = await _leaveRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId
                && (rotaStaffMemberId != null ? x.RotaStaffMemberId == rotaStaffMemberId : x.UserId == userId)
                && x.Status == LeaveRequestStatus.Approved && x.Type == LeaveType.Holiday
                && x.StartDate <= yearEnd && x.EndDate >= yearStart)
            .Select(x => new { x.StartDate, x.EndDate, x.HoursPerDay })
            .ToListAsync(cancellationToken);
        var usedHours = Math.Round(
            holidays.Sum(x => OverlapDays(x.StartDate, x.EndDate, yearStart, yearEnd) * x.HoursPerDay), 2);

        return new LeaveBalanceDto
        {
            YearStart = yearStart,
            EntitledHours = entitlement.EntitledHours,
            UsualHoursPerDay = entitlement.UsualHoursPerDay,
            UsedHours = usedHours,
            RemainingHours = Math.Round(entitlement.EntitledHours - usedHours, 2),
        };
    }

    public async Task<IReadOnlyCollection<LeaveEntitlementDto>> GetEntitlementsAsync(Guid shopId, CancellationToken cancellationToken = default)
    {
        await EnsureManageAsync(shopId, cancellationToken);
        var rows = await _entitlementRepository.Query()
            .AsNoTracking()
            .Include(x => x.User)
            .Include(x => x.RotaStaffMember)
            .Where(x => x.ShopId == shopId)
            .ToListAsync(cancellationToken);
        return rows
            .Select(x => MapEntitlement(x, x.User != null ? FullName(x.User) : (x.RotaStaffMember?.Name ?? "—")))
            .OrderByDescending(x => x.YearStart)
            .ThenBy(x => x.UserName)
            .ToArray();
    }

    private static LeaveEntitlementDto MapEntitlement(StaffLeaveEntitlement x, string userName) => new()
    {
        Id = x.Id,
        ShopId = x.ShopId,
        UserId = x.UserId,
        RotaStaffMemberId = x.RotaStaffMemberId,
        IsExternal = x.RotaStaffMemberId != null,
        UserName = userName,
        YearStart = x.YearStart,
        EntitledHours = x.EntitledHours,
        UsualHoursPerDay = x.UsualHoursPerDay,
    };

    public async Task<LeaveEntitlementDto> UpsertEntitlementAsync(UpsertLeaveEntitlementRequest request, CancellationToken cancellationToken = default)
    {
        await EnsureManageAsync(request.ShopId, cancellationToken);
        if (request.UserId is null == request.RotaStaffMemberId is null)
        {
            throw new AppException("leave_person_invalid", "Pick either a user or a roster staff member (not both).");
        }
        if (request.EntitledHours < 0)
        {
            throw new AppException("leave_invalid_entitlement", "Entitled hours can't be negative.");
        }
        var usualHoursPerDay = request.UsualHoursPerDay <= 0 ? 8m : request.UsualHoursPerDay;
        if (usualHoursPerDay is < 0.5m or > 24m)
        {
            throw new AppException("leave_invalid_hours", "Usual hours per day must be between 0.5 and 24.");
        }
        var name = await ResolvePersonNameAsync(request.ShopId, request.UserId, request.RotaStaffMemberId, cancellationToken);

        var now = DateTimeOffset.UtcNow;
        var entitlement = await _entitlementRepository.Query()
            .FirstOrDefaultAsync(x => x.ShopId == request.ShopId
                && x.UserId == request.UserId && x.RotaStaffMemberId == request.RotaStaffMemberId
                && x.YearStart == request.YearStart, cancellationToken);
        if (entitlement is null)
        {
            entitlement = new StaffLeaveEntitlement
            {
                ShopId = request.ShopId,
                UserId = request.UserId,
                RotaStaffMemberId = request.RotaStaffMemberId,
                YearStart = request.YearStart,
                CreatedOn = now,
                CreatedBy = _currentUserService.UserId,
            };
            await _entitlementRepository.AddAsync(entitlement, cancellationToken);
        }
        else
        {
            entitlement.ModifiedOn = now;
            entitlement.ModifiedBy = _currentUserService.UserId;
            _entitlementRepository.Update(entitlement);
        }
        entitlement.EntitledHours = request.EntitledHours;
        entitlement.UsualHoursPerDay = usualHoursPerDay;
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return MapEntitlement(entitlement, name);
    }

    public async Task<IReadOnlyCollection<LeaveDayDto>> GetDaysAsync(Guid shopId, Guid? userId, Guid? rotaStaffMemberId, DateOnly from, DateOnly to, CancellationToken cancellationToken = default)
    {
        if (userId != null && rotaStaffMemberId != null)
        {
            throw new AppException("leave_person_invalid", "Pick either a user or a roster staff member (not both).");
        }
        // Staff can read their own days; anyone else's requires manage.
        if (rotaStaffMemberId is null && (userId is null || userId == _currentUserService.UserId))
        {
            await EnsureStaffAsync(shopId, cancellationToken);
            userId ??= CurrentUserId;
        }
        else
        {
            await EnsureManageAsync(shopId, cancellationToken);
        }

        var rows = await _leaveRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId
                && (rotaStaffMemberId != null ? x.RotaStaffMemberId == rotaStaffMemberId : x.UserId == userId)
                && x.Status == LeaveRequestStatus.Approved
                && x.StartDate <= to && x.EndDate >= from)
            .Select(x => new { x.Id, x.Type, x.StartDate, x.EndDate, x.HoursPerDay, x.IsPaid })
            .ToListAsync(cancellationToken);

        var days = new List<LeaveDayDto>();
        foreach (var leave in rows)
        {
            var start = leave.StartDate > from ? leave.StartDate : from;
            var end = leave.EndDate < to ? leave.EndDate : to;
            for (var date = start; date <= end; date = date.AddDays(1))
            {
                days.Add(new LeaveDayDto
                {
                    Date = date,
                    Type = leave.Type.ToString(),
                    Hours = leave.HoursPerDay,
                    IsPaid = leave.IsPaid,
                    LeaveRequestId = leave.Id,
                });
            }
        }
        return days.OrderBy(d => d.Date).ToArray();
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
                    RelatedEntityName = nameof(LeaveRequest),
                    RelatedEntityId = relatedId,
                }, cancellationToken);
            }
        }
        catch
        {
            // Notification failures must not block the leave workflow.
        }
    }

    // Push the shop's managers/owners (best-effort).
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
}
