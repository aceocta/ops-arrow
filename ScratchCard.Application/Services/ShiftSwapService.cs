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

public sealed class ShiftSwapService : IShiftSwapService
{
    private static readonly string[] StaffRoles = [RoleNames.CompanyOwner, RoleNames.Manager, RoleNames.Cashier, RoleNames.SalesAssistant];
    private static readonly string[] ManagementRoles = [RoleNames.CompanyOwner, RoleNames.Manager];

    private readonly IRepository<ShiftSwapRequest> _requests;
    private readonly IRepository<RotaShift> _shifts;
    private readonly IRepository<ShiftAssignment> _assignments;
    private readonly IRepository<User> _users;
    private readonly IRepository<RotaStaffMember> _members;
    private readonly IRepository<ShopUser> _shopUsers;
    private readonly IShopMembershipService _shopMembership;
    private readonly IFeatureGateService _featureGate;
    private readonly INotificationService _notifications;
    private readonly ICurrentUserService _currentUser;
    private readonly IUnitOfWork _unitOfWork;

    public ShiftSwapService(
        IRepository<ShiftSwapRequest> requests,
        IRepository<RotaShift> shifts,
        IRepository<ShiftAssignment> assignments,
        IRepository<User> users,
        IRepository<RotaStaffMember> members,
        IRepository<ShopUser> shopUsers,
        IShopMembershipService shopMembership,
        IFeatureGateService featureGate,
        INotificationService notifications,
        ICurrentUserService currentUser,
        IUnitOfWork unitOfWork)
    {
        _requests = requests;
        _shifts = shifts;
        _assignments = assignments;
        _users = users;
        _members = members;
        _shopUsers = shopUsers;
        _shopMembership = shopMembership;
        _featureGate = featureGate;
        _notifications = notifications;
        _currentUser = currentUser;
        _unitOfWork = unitOfWork;
    }

    private Guid CurrentUserId => _currentUser.UserId ?? throw new AppException("unauthorized", "No authenticated user.", 401);

    private async Task EnsureAccessAsync(Guid shopId, CancellationToken ct)
    {
        await _shopMembership.EnsureCurrentUserShopRoleAsync(shopId, StaffRoles, ct);
        await _featureGate.EnsureFeatureAsync(shopId, FeatureKeys.StaffRotaShiftSwap, ct);
    }

    public async Task<ShiftSwapRequestDto> CreateAsync(CreateShiftSwapRequest request, CancellationToken cancellationToken = default)
    {
        await EnsureAccessAsync(request.ShopId, cancellationToken);
        var me = CurrentUserId;

        if (request.TargetUserId is null == (request.TargetRotaStaffMemberId is null))
            throw new AppException("invalid_target", "Pick exactly one staff member to swap with.", 400);

        var fromShift = await _shifts.Query().FirstOrDefaultAsync(s => s.Id == request.FromShiftId && s.ShopId == request.ShopId, cancellationToken)
            ?? throw new AppException("shift_not_found", "Your shift was not found.", 404);
        if (fromShift.ShiftDate < DateOnly.FromDateTime(DateTime.UtcNow))
            throw new AppException("shift_past", "You can't swap a shift in the past.", 400);

        // The requester must actually be assigned to the shift they're giving up.
        var fromAssignment = await _assignments.Query()
            .FirstOrDefaultAsync(a => a.RotaShiftId == request.FromShiftId && a.UserId == me, cancellationToken)
            ?? throw new AppException("not_assigned", "You're not assigned to this shift.", 400);

        if (request.Type == ShiftSwapType.Swap)
        {
            if (request.ToShiftId is null) throw new AppException("to_shift_required", "Pick the shift to swap into.", 400);
            var toShift = await _shifts.Query().FirstOrDefaultAsync(s => s.Id == request.ToShiftId && s.ShopId == request.ShopId, cancellationToken)
                ?? throw new AppException("to_shift_not_found", "The target shift was not found.", 404);
            var targetOnTo = await _assignments.Query().AnyAsync(a => a.RotaShiftId == request.ToShiftId &&
                a.UserId == request.TargetUserId && a.RotaStaffMemberId == request.TargetRotaStaffMemberId, cancellationToken);
            if (!targetOnTo) throw new AppException("target_not_on_shift", "That staff member isn't assigned to the chosen shift.", 400);
        }

        var dup = await _requests.Query().AnyAsync(r => r.FromShiftId == request.FromShiftId && r.Status == ShiftSwapStatus.Pending, cancellationToken);
        if (dup) throw new AppException("duplicate_request", "There's already an open swap request for this shift.", 409);

        var entity = new ShiftSwapRequest
        {
            ShopId = request.ShopId,
            Type = request.Type,
            Status = ShiftSwapStatus.Pending,
            RequesterUserId = me,
            FromShiftId = request.FromShiftId,
            TargetUserId = request.TargetUserId,
            TargetRotaStaffMemberId = request.TargetRotaStaffMemberId,
            ToShiftId = request.Type == ShiftSwapType.Swap ? request.ToShiftId : null,
            Note = request.Note,
            CreatedOn = DateTimeOffset.UtcNow,
            CreatedBy = me,
        };
        await _requests.AddAsync(entity, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await NotifyCreatedAsync(entity, cancellationToken);
        return await MapAsync(entity, cancellationToken);
    }

    public async Task<ShiftSwapRequestDto> RespondAsync(Guid id, bool accept, CancellationToken cancellationToken = default)
    {
        var req = await _requests.Query().FirstOrDefaultAsync(r => r.Id == id, cancellationToken)
            ?? throw new AppException("request_not_found", "Swap request not found.", 404);
        await EnsureAccessAsync(req.ShopId, cancellationToken);
        if (req.Status != ShiftSwapStatus.Pending) throw new AppException("not_pending", "This request has already been handled.", 409);

        var me = CurrentUserId;
        var isManager = await IsManagerAsync(req.ShopId, me, cancellationToken);
        var isPeer = req.TargetUserId is { } tu && tu == me;     // registered-user target can self-accept
        if (!isManager && !isPeer)
            throw new AppException("forbidden", "Only the chosen staff member or a manager can respond.", 403);

        req.RespondedOn = DateTimeOffset.UtcNow;
        req.RespondedByUserId = me;

        if (!accept)
        {
            req.Status = ShiftSwapStatus.Declined;
            _requests.Update(req);
            await _unitOfWork.SaveChangesAsync(cancellationToken);
            await NotifyRequesterAsync(req, NotificationType.ShiftSwapDeclined, "Shift swap declined",
                $"Your shift swap request was declined.", cancellationToken);
            return await MapAsync(req, cancellationToken);
        }

        // Accept → reassign and complete.
        var fromAssignment = await _assignments.Query()
            .FirstOrDefaultAsync(a => a.RotaShiftId == req.FromShiftId && a.UserId == req.RequesterUserId, cancellationToken)
            ?? throw new AppException("assignment_gone", "The requester is no longer on that shift.", 409);
        fromAssignment.UserId = req.TargetUserId;
        fromAssignment.RotaStaffMemberId = req.TargetRotaStaffMemberId;
        _assignments.Update(fromAssignment);

        if (req.Type == ShiftSwapType.Swap && req.ToShiftId is { } toShiftId)
        {
            var toAssignment = await _assignments.Query()
                .FirstOrDefaultAsync(a => a.RotaShiftId == toShiftId &&
                    a.UserId == req.TargetUserId && a.RotaStaffMemberId == req.TargetRotaStaffMemberId, cancellationToken)
                ?? throw new AppException("assignment_gone", "The target is no longer on that shift.", 409);
            toAssignment.UserId = req.RequesterUserId;
            toAssignment.RotaStaffMemberId = null;
            _assignments.Update(toAssignment);
        }

        req.Status = ShiftSwapStatus.Completed;
        _requests.Update(req);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await NotifyCompletedAsync(req, cancellationToken);
        return await MapAsync(req, cancellationToken);
    }

    public async Task<ShiftSwapRequestDto> CancelAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var req = await _requests.Query().FirstOrDefaultAsync(r => r.Id == id, cancellationToken)
            ?? throw new AppException("request_not_found", "Swap request not found.", 404);
        await EnsureAccessAsync(req.ShopId, cancellationToken);
        var me = CurrentUserId;
        if (req.RequesterUserId != me && !await IsManagerAsync(req.ShopId, me, cancellationToken))
            throw new AppException("forbidden", "Only the requester or a manager can cancel.", 403);
        if (req.Status != ShiftSwapStatus.Pending) throw new AppException("not_pending", "This request has already been handled.", 409);
        req.Status = ShiftSwapStatus.Cancelled;
        _requests.Update(req);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return await MapAsync(req, cancellationToken);
    }

    public async Task<IReadOnlyCollection<ShiftSwapRequestDto>> ListAsync(Guid shopId, CancellationToken cancellationToken = default)
    {
        await EnsureAccessAsync(shopId, cancellationToken);
        var me = CurrentUserId;
        var isManager = await IsManagerAsync(shopId, me, cancellationToken);
        var since = DateTimeOffset.UtcNow.AddDays(-14);

        var rows = await _requests.Query().AsNoTracking()
            .Where(r => r.ShopId == shopId && (r.Status == ShiftSwapStatus.Pending || r.CreatedOn >= since))
            .OrderByDescending(r => r.CreatedOn)
            .ToListAsync(cancellationToken);

        // Staff see only their own outgoing + requests targeted at them; managers see everything.
        if (!isManager)
            rows = rows.Where(r => r.RequesterUserId == me || r.TargetUserId == me).ToList();

        var result = new List<ShiftSwapRequestDto>();
        foreach (var r in rows) result.Add(await MapAsync(r, cancellationToken, isManager, me));
        return result;
    }

    // --- internals ---

    private async Task<bool> IsManagerAsync(Guid shopId, Guid userId, CancellationToken ct)
    {
        var role = await _shopMembership.GetShopRoleAsync(userId, shopId, ct);
        return role is RoleNames.CompanyOwner or RoleNames.Manager or RoleNames.PlatformAdmin;
    }

    private async Task<string> ShiftLabelAsync(Guid shiftId, CancellationToken ct)
    {
        var s = await _shifts.Query().AsNoTracking().FirstOrDefaultAsync(x => x.Id == shiftId, ct);
        if (s is null) return "shift";
        return $"{s.ShiftDate:ddd dd MMM} · {s.ShiftName} ({s.StartTime:HH\\:mm}–{s.EndTime:HH\\:mm})";
    }

    private async Task<string> TargetNameAsync(ShiftSwapRequest r, CancellationToken ct)
    {
        if (r.TargetUserId is { } uid)
        {
            var u = await _users.Query().AsNoTracking().FirstOrDefaultAsync(x => x.Id == uid, ct);
            return u is null ? "Staff" : DisplayName(u);
        }
        var m = await _members.Query().AsNoTracking().FirstOrDefaultAsync(x => x.Id == r.TargetRotaStaffMemberId, ct);
        return m?.Name ?? "Staff";
    }

    private static string DisplayName(User u) =>
        string.IsNullOrWhiteSpace($"{u.FirstName} {u.LastName}".Trim()) ? u.Email : $"{u.FirstName} {u.LastName}".Trim();

    private async Task<ShiftSwapRequestDto> MapAsync(ShiftSwapRequest r, CancellationToken ct, bool? isManager = null, Guid? me = null)
    {
        var requester = await _users.Query().AsNoTracking().FirstOrDefaultAsync(x => x.Id == r.RequesterUserId, ct);
        var canRespond = (isManager ?? false) || (me is { } m && r.TargetUserId == m);
        return new ShiftSwapRequestDto
        {
            Id = r.Id,
            ShopId = r.ShopId,
            Type = r.Type,
            Status = r.Status,
            RequesterUserId = r.RequesterUserId,
            RequesterName = requester is null ? "Staff" : DisplayName(requester),
            FromShiftId = r.FromShiftId,
            FromShiftLabel = await ShiftLabelAsync(r.FromShiftId, ct),
            TargetUserId = r.TargetUserId,
            TargetRotaStaffMemberId = r.TargetRotaStaffMemberId,
            TargetIsExternal = r.TargetRotaStaffMemberId.HasValue,
            TargetName = await TargetNameAsync(r, ct),
            ToShiftId = r.ToShiftId,
            ToShiftLabel = r.ToShiftId is { } toId ? await ShiftLabelAsync(toId, ct) : null,
            Note = r.Note,
            CreatedOn = r.CreatedOn,
            CanRespond = r.Status == ShiftSwapStatus.Pending && canRespond,
        };
    }

    private async Task<List<string>> ManagerEmailsAsync(Guid shopId, CancellationToken ct) =>
        await _shopUsers.Query().AsNoTracking()
            .Where(x => x.ShopId == shopId && x.IsActive && !string.IsNullOrWhiteSpace(x.User.Email) &&
                (x.Role.Name == RoleNames.CompanyOwner || x.Role.Name == RoleNames.Manager))
            .Select(x => x.User.Email!).Distinct().ToListAsync(ct);

    private async Task SendAsync(Guid shopId, IEnumerable<string> recipients, NotificationType type, string subject, string body, Guid relatedId, CancellationToken ct)
    {
        foreach (var to in recipients.Where(e => !string.IsNullOrWhiteSpace(e)).Distinct())
        {
            try
            {
                await _notifications.SendAsync(new NotificationMessage
                {
                    ShopId = shopId,
                    NotificationType = type,
                    Channel = NotificationChannel.Email,
                    Recipient = to,
                    Subject = subject,
                    Body = body,
                    RelatedEntityName = nameof(ShiftSwapRequest),
                    RelatedEntityId = relatedId,
                }, ct);
            }
            catch { /* best-effort; never block the swap */ }
        }
    }

    private async Task NotifyCreatedAsync(ShiftSwapRequest r, CancellationToken ct)
    {
        try
        {
            var requester = await _users.Query().AsNoTracking().Where(u => u.Id == r.RequesterUserId).Select(u => DisplayName(u)).FirstOrDefaultAsync(ct) ?? "A colleague";
            var fromLabel = await ShiftLabelAsync(r.FromShiftId, ct);
            var verb = r.Type == ShiftSwapType.Swap ? "swap" : "give you their shift";
            var managerEmails = await ManagerEmailsAsync(r.ShopId, ct);

            if (r.TargetUserId is { } targetUserId)
            {
                var targetEmail = await _users.Query().AsNoTracking().Where(u => u.Id == targetUserId).Select(u => u.Email).FirstOrDefaultAsync(ct);
                if (!string.IsNullOrWhiteSpace(targetEmail))
                {
                    await SendAsync(r.ShopId, new[] { targetEmail! }, NotificationType.ShiftSwapRequested,
                        "Shift swap request", $"{requester} wants to {verb}: {fromLabel}. Open the app to accept or decline.", r.Id, ct);
                }
                // Managers FYI
                await SendAsync(r.ShopId, managerEmails, NotificationType.ShiftSwapRequested,
                    "Shift swap requested", $"{requester} requested a shift {(r.Type == ShiftSwapType.Swap ? "swap" : "give-away")} ({fromLabel}).", r.Id, ct);
            }
            else
            {
                // External target — manager-mediated: managers action it.
                var targetName = await TargetNameAsync(r, ct);
                await SendAsync(r.ShopId, managerEmails, NotificationType.ShiftSwapRequested,
                    "Shift swap needs your action", $"{requester} wants to {verb} ({fromLabel}) with {targetName} (external). Approve it in the app.", r.Id, ct);
            }
        }
        catch { /* best-effort */ }
    }

    private async Task NotifyCompletedAsync(ShiftSwapRequest r, CancellationToken ct)
    {
        try
        {
            var fromLabel = await ShiftLabelAsync(r.FromShiftId, ct);
            var targetName = await TargetNameAsync(r, ct);
            var emails = new List<string>();
            var requesterEmail = await _users.Query().AsNoTracking().Where(u => u.Id == r.RequesterUserId).Select(u => u.Email).FirstOrDefaultAsync(ct);
            if (!string.IsNullOrWhiteSpace(requesterEmail)) emails.Add(requesterEmail!);
            if (r.TargetUserId is { } tu)
            {
                var te = await _users.Query().AsNoTracking().Where(u => u.Id == tu).Select(u => u.Email).FirstOrDefaultAsync(ct);
                if (!string.IsNullOrWhiteSpace(te)) emails.Add(te!);
            }
            emails.AddRange(await ManagerEmailsAsync(r.ShopId, ct));
            await SendAsync(r.ShopId, emails, NotificationType.ShiftSwapCompleted,
                "Shift swap confirmed", $"The shift {(r.Type == ShiftSwapType.Swap ? "swap" : "give-away")} is confirmed — {fromLabel} is now {targetName}'s.", r.Id, ct);
        }
        catch { /* best-effort */ }
    }

    private async Task NotifyRequesterAsync(ShiftSwapRequest r, NotificationType type, string subject, string body, CancellationToken ct)
    {
        try
        {
            var email = await _users.Query().AsNoTracking().Where(u => u.Id == r.RequesterUserId).Select(u => u.Email).FirstOrDefaultAsync(ct);
            if (!string.IsNullOrWhiteSpace(email)) await SendAsync(r.ShopId, new[] { email! }, type, subject, body, r.Id, ct);
        }
        catch { /* best-effort */ }
    }
}
