using ScratchCard.Domain.Common;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Domain.Entities;

/// <summary>
/// A scheduled work shift (rota slot) for a shop on a given day. Staff are linked via
/// <see cref="ShiftAssignment"/>; actual worked time is recorded in <see cref="ShiftAttendance"/>.
/// Distinct from the trading/till "Shift" used for sales reconciliation.
/// </summary>
public class RotaShift : SoftDeletableAuditableEntity
{
    public Guid ShopId { get; set; }
    // The shift spans ShiftDate@StartTime → EndDate@EndTime. For an overnight shift (EndTime on or
    // before StartTime) EndDate is the day after ShiftDate; otherwise EndDate equals ShiftDate.
    public DateOnly ShiftDate { get; set; }
    public DateOnly EndDate { get; set; }
    // The shop's business day for ShiftDate, linked when that day exists (rosters are often created
    // before the day is opened, so this stays null until a matching business day is present).
    public Guid? BusinessDayId { get; set; }
    // The configured shop shift template this slot uses (id + name snapshot); times are copied from it.
    public string? ShiftTemplateId { get; set; }
    public string ShiftName { get; set; } = string.Empty;
    public TimeOnly StartTime { get; set; }
    public TimeOnly EndTime { get; set; }
    public string? Position { get; set; }
    public string? Notes { get; set; }
    // When the pre-shift push reminder was sent, so the reminder job fires at most once per shift.
    public DateTimeOffset? ReminderSentOn { get; set; }

    /// <summary>True when the shift finishes on the day after it starts (overnight).</summary>
    public bool IsOvernight => EndDate > ShiftDate;

    public Shop Shop { get; set; } = null!;
    public ICollection<ShiftAssignment> Assignments { get; set; } = new List<ShiftAssignment>();
}

/// <summary>
/// Links someone to a rota shift (a shift can have several). The person is either a registered
/// <see cref="User"/> (UserId set) or a roster-only <see cref="RotaStaffMember"/> (RotaStaffMemberId set).
/// </summary>
public class ShiftAssignment : AuditableEntity
{
    public Guid RotaShiftId { get; set; }
    public Guid ShopId { get; set; }
    public Guid? UserId { get; set; }
    public Guid? RotaStaffMemberId { get; set; }

    public RotaShift RotaShift { get; set; } = null!;
    public User? User { get; set; }
    public RotaStaffMember? RotaStaffMember { get; set; }
}

/// <summary>
/// A check-in / check-out record. Linked to the open business day at check-in and, when available,
/// the staff member's rota shift for that day.
/// </summary>
public class ShiftAttendance : AuditableEntity
{
    public Guid ShopId { get; set; }
    // Either a registered user (UserId) or a roster-only member (RotaStaffMemberId) — exactly one.
    public Guid? UserId { get; set; }
    public Guid? RotaStaffMemberId { get; set; }
    public Guid? BusinessDayId { get; set; }
    public Guid? RotaShiftId { get; set; }
    public DateTimeOffset CheckInAt { get; set; }
    public DateTimeOffset? CheckOutAt { get; set; }
    public AttendanceEntryMethod EntryMethod { get; set; } = AttendanceEntryMethod.Clocked;
    public bool IsApproved { get; set; } = true;
    public Guid? ApprovedByUserId { get; set; }
    public DateTimeOffset? ApprovedOn { get; set; }
    public string? Notes { get; set; }

    public Shop Shop { get; set; } = null!;
    public User? User { get; set; }
    public RotaStaffMember? RotaStaffMember { get; set; }
}
