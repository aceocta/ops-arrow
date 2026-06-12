using ScratchCard.Domain.Common;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Domain.Entities;

/// <summary>
/// A leave (holiday / sick / unpaid / other) booking for a staff member. Staff raise their own
/// requests (Pending → manager decision); a manager can record leave on someone's behalf, which is
/// created directly Approved. The person is either a registered <see cref="User"/> (UserId set) or
/// a roster-only <see cref="RotaStaffMember"/> (RotaStaffMemberId set) — exactly one.
/// </summary>
public class LeaveRequest : AuditableEntity
{
    public Guid ShopId { get; set; }
    public Guid? UserId { get; set; }
    public Guid? RotaStaffMemberId { get; set; }
    public LeaveType Type { get; set; }
    // Inclusive calendar span: StartDate..EndDate (EndDate >= StartDate).
    public DateOnly StartDate { get; set; }
    public DateOnly EndDate { get; set; }
    // Hours the person is off per day of the span (0.5–24).
    public decimal HoursPerDay { get; set; }
    // Holiday defaults to paid, Unpaid to unpaid; Sick/Other default unpaid and are
    // manager-settable at approval.
    public bool IsPaid { get; set; }
    public LeaveRequestStatus Status { get; set; } = LeaveRequestStatus.Pending;
    // The staff member's note on the request (why / context).
    public string? StaffNote { get; set; }
    // The manager's approval / rejection note.
    public string? ManagerNote { get; set; }
    public Guid? DecidedByUserId { get; set; }
    public DateTimeOffset? DecidedOn { get; set; }

    public Shop Shop { get; set; } = null!;
    public User? User { get; set; }
    public RotaStaffMember? RotaStaffMember { get; set; }
    public User? DecidedByUser { get; set; }
}

/// <summary>
/// A staff member's annual leave entitlement for the leave year starting at <see cref="YearStart"/>
/// (the year window is YearStart..YearStart+1y). Used hours are computed from approved Holiday
/// leave overlapping that window. Targets either a registered <see cref="User"/> or a roster-only
/// <see cref="RotaStaffMember"/> (exactly one).
/// </summary>
public class StaffLeaveEntitlement : AuditableEntity
{
    public Guid ShopId { get; set; }
    public Guid? UserId { get; set; }
    public Guid? RotaStaffMemberId { get; set; }
    public DateOnly YearStart { get; set; }
    public decimal EntitledHours { get; set; }
    // The person's usual working hours per day — the client's default for new leave requests.
    public decimal UsualHoursPerDay { get; set; } = 8;

    public Shop Shop { get; set; } = null!;
    public User? User { get; set; }
    public RotaStaffMember? RotaStaffMember { get; set; }
}
