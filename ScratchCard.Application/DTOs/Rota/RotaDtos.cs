namespace ScratchCard.Application.DTOs.Rota;

public class RotaAssigneeDto
{
    // Either UserId (registered) or RotaStaffMemberId (roster-only) is set.
    public Guid? UserId { get; set; }
    public Guid? RotaStaffMemberId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public string? Email { get; set; }
    public bool IsExternal { get; set; }
    // Why this person is on the shift; null means the default "Regular shift".
    public string? Reason { get; set; }
    public string? Note { get; set; }
}

public class RotaStaffMemberDto
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public string? Email { get; set; }
    public bool IsActive { get; set; } = true;
}

// A configured shop shift template (Morning / Evening …) the rota draws from.
public class RotaShiftTemplateDto
{
    public string TemplateId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public TimeOnly StartTime { get; set; }
    public TimeOnly EndTime { get; set; }
}

public class RotaShiftDto
{
    public Guid Id { get; set; }
    public Guid ShopId { get; set; }
    public DateOnly ShiftDate { get; set; }
    public DateOnly EndDate { get; set; }
    public Guid? BusinessDayId { get; set; }
    public string? ShiftTemplateId { get; set; }
    public string ShiftName { get; set; } = string.Empty;
    public TimeOnly StartTime { get; set; }
    public TimeOnly EndTime { get; set; }
    public string? Position { get; set; }
    public string? Notes { get; set; }
    public IReadOnlyCollection<RotaAssigneeDto> Assignees { get; set; } = [];
    // Only populated in "my shifts": the current user's attendance for this shift, if any.
    public ShiftAttendanceDto? MyAttendance { get; set; }
}

// One assignee in a save-shift request, with an optional non-regular reason + note.
// Exactly one of UserId (registered) or RotaStaffMemberId (roster-only) should be set.
public class SaveShiftAssignmentRequest
{
    public Guid? UserId { get; set; }
    public Guid? RotaStaffMemberId { get; set; }
    // Empty or "Regular shift" (any casing) is normalized to null (the default).
    public string? Reason { get; set; }
    public string? Note { get; set; }
}

public class CreateRotaShiftRequest
{
    public Guid ShopId { get; set; }
    public DateOnly ShiftDate { get; set; }
    public string ShiftTemplateId { get; set; } = string.Empty;
    public string? Position { get; set; }
    public string? Notes { get; set; }
    public IReadOnlyCollection<Guid> AssigneeUserIds { get; set; } = [];
    public IReadOnlyCollection<Guid> AssigneeStaffMemberIds { get; set; } = [];
    // When non-null this list is authoritative (the id arrays above are ignored).
    public IReadOnlyCollection<SaveShiftAssignmentRequest>? Assignments { get; set; }
}

public class UpdateRotaShiftRequest
{
    public Guid ShopId { get; set; }
    public DateOnly ShiftDate { get; set; }
    public string ShiftTemplateId { get; set; } = string.Empty;
    public string? Position { get; set; }
    public string? Notes { get; set; }
    public IReadOnlyCollection<Guid> AssigneeUserIds { get; set; } = [];
    public IReadOnlyCollection<Guid> AssigneeStaffMemberIds { get; set; } = [];
    // When non-null this list is authoritative (the id arrays above are ignored).
    public IReadOnlyCollection<SaveShiftAssignmentRequest>? Assignments { get; set; }
}

public class SaveRotaStaffMemberRequest
{
    public Guid ShopId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public string? Email { get; set; }
}

public class ShiftAttendanceDto
{
    public Guid Id { get; set; }
    public Guid ShopId { get; set; }
    public Guid? UserId { get; set; }
    public Guid? RotaStaffMemberId { get; set; }
    public bool IsExternal { get; set; }
    public string UserName { get; set; } = string.Empty;
    public Guid? RotaShiftId { get; set; }
    public Guid? BusinessDayId { get; set; }
    public DateTimeOffset CheckInAt { get; set; }
    public DateTimeOffset? CheckOutAt { get; set; }
    public string EntryMethod { get; set; } = "Clocked"; // Clocked | Manual
    public bool IsApproved { get; set; } = true;
}

public class ManualAttendanceRequest
{
    public Guid ShopId { get; set; }
    public Guid? RotaShiftId { get; set; }
    // When set, a manager is recording hours for a roster-only member (instead of the current user).
    public Guid? RotaStaffMemberId { get; set; }
    // When set (and not the current user), a manager is recording hours for another internal user.
    public Guid? UserId { get; set; }
    public DateTimeOffset CheckInAt { get; set; }
    public DateTimeOffset? CheckOutAt { get; set; }
    public string? Notes { get; set; }
}

public class UpdateAttendanceRequest
{
    public DateTimeOffset CheckInAt { get; set; }
    public DateTimeOffset? CheckOutAt { get; set; }
    public string? Notes { get; set; }
}

// A pending manual attendance awaiting manager approval.
public class AttendanceApprovalRowDto
{
    public Guid Id { get; set; }
    public Guid? UserId { get; set; }
    public string UserName { get; set; } = string.Empty;
    public string? ShiftName { get; set; }
    public DateOnly? ShiftDate { get; set; }
    public DateOnly? ShiftEndDate { get; set; }
    public TimeOnly? ShiftStart { get; set; }
    public TimeOnly? ShiftEnd { get; set; }
    public DateTimeOffset CheckInAt { get; set; }
    public DateTimeOffset? CheckOutAt { get; set; }
    public string EntryMethod { get; set; } = "Manual";
    public DateTimeOffset SubmittedOn { get; set; }
    public string? Notes { get; set; }
}

public class AssignableUserDto
{
    // For registered users UserId is set; for roster-only members RotaStaffMemberId is set + IsExternal.
    public Guid? UserId { get; set; }
    public Guid? RotaStaffMemberId { get; set; }
    public bool IsExternal { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
}

// Rostered-vs-worked view for one business day (shown on the day-close / business-day screen).
public class BusinessDayStaffRowDto
{
    public Guid? UserId { get; set; }
    public Guid? RotaStaffMemberId { get; set; }
    public bool IsExternal { get; set; }
    public string UserName { get; set; } = string.Empty;
    public string? ShiftName { get; set; }
    public TimeOnly? StartTime { get; set; }
    public TimeOnly? EndTime { get; set; }
    public DateTimeOffset? CheckInAt { get; set; }
    public DateTimeOffset? CheckOutAt { get; set; }
    public decimal Hours { get; set; }
    public string Status { get; set; } = "Scheduled"; // Scheduled | OnShift | Completed | Unplanned
}

public class BusinessDayStaffDto
{
    public DateOnly Date { get; set; }
    public string DayStatus { get; set; } = "NotStarted";
    public decimal TotalHours { get; set; }
    public int OnShiftCount { get; set; }
    public IReadOnlyCollection<BusinessDayStaffRowDto> Rows { get; set; } = [];
}

public class TimesheetRowDto
{
    public Guid? UserId { get; set; }
    public Guid? RotaStaffMemberId { get; set; }
    public bool IsExternal { get; set; }
    public string UserName { get; set; } = string.Empty;
    public int ShiftsWorked { get; set; }      // attendance records that were checked out
    public int OpenSessions { get; set; }       // checked in but not out
    public decimal TotalHours { get; set; }     // sum of completed sessions (approved + pending)
    public decimal PendingHours { get; set; }   // portion of TotalHours awaiting approval
    public decimal? HourlyRate { get; set; }    // current rate (null if labour-cost not entitled / no rate)
    public decimal? LabourCost { get; set; }    // Σ session hours × rate effective on each session's date (all)
    public decimal? PendingLabourCost { get; set; } // portion of LabourCost from unapproved sessions
    // Approved leave hours (days overlapping the range × hoursPerDay) per leave type. Sick counts
    // toward SickHours whether paid or not. Paid leave hours are also included in LabourCost at
    // the person's current rate when the labour-cost feature is enabled.
    public decimal HolidayHours { get; set; }
    public decimal SickHours { get; set; }
    public decimal OtherLeaveHours { get; set; }
    public decimal UnpaidLeaveHours { get; set; }
    // Distinct non-regular assignment reasons (e.g. "Overtime", "Cover") across this person's
    // sessions in the range, alphabetical. Empty when all sessions were regular/unrostered.
    public List<string> Reasons { get; set; } = [];
}

// One worked session in a staff member's timesheet drill-down.
public class TimesheetSessionDto
{
    public Guid Id { get; set; }
    public DateOnly Date { get; set; }
    public string? ShiftName { get; set; }
    // The person's assignment reason on the session's rota shift; null when there is no
    // shift/assignment or it's a regular shift.
    public string? Reason { get; set; }
    public DateTimeOffset CheckInAt { get; set; }
    public DateTimeOffset? CheckOutAt { get; set; }
    public decimal Hours { get; set; }
    public string EntryMethod { get; set; } = "Clocked";
    public bool IsApproved { get; set; } = true;
}

// One worked session in a shift's drill-down (who worked it, when).
public class ShiftSessionDto
{
    public Guid Id { get; set; }
    public DateOnly Date { get; set; }
    public Guid? UserId { get; set; }
    public Guid? RotaStaffMemberId { get; set; }
    public bool IsExternal { get; set; }
    public string UserName { get; set; } = string.Empty;
    // This person's assignment reason on the session's rota shift; null when unrostered,
    // there is no assignment, or it's a regular shift.
    public string? Reason { get; set; }
    public DateTimeOffset CheckInAt { get; set; }
    public DateTimeOffset? CheckOutAt { get; set; }
    public decimal Hours { get; set; }
    public string EntryMethod { get; set; } = "Clocked";
    public bool IsApproved { get; set; } = true;
}

// Payroll lock: attendance with a check-in date on or before LockedThrough is frozen (wages paid).
public class RotaTimesheetLockDto
{
    public Guid ShopId { get; set; }
    public DateOnly LockedThrough { get; set; }
    public Guid LockedByUserId { get; set; }
    public string LockedByName { get; set; } = string.Empty;
    public DateTimeOffset LockedOn { get; set; }
    public string? Notes { get; set; }
}

public class SetTimesheetLockRequest
{
    public Guid ShopId { get; set; }
    // Null clears the lock (unlock). Otherwise must be a date strictly before today.
    public DateOnly? LockedThrough { get; set; }
    public string? Notes { get; set; }
}

// One staff member's sign-off row for a pay period (manager view and "my reviews" view).
public class RotaTimesheetReviewDto
{
    public Guid Id { get; set; }
    public Guid ShopId { get; set; }
    public DateOnly PeriodFrom { get; set; }
    public DateOnly PeriodTo { get; set; }
    public Guid UserId { get; set; }
    public string UserName { get; set; } = string.Empty;
    public string Status { get; set; } = "PendingStaff"; // PendingStaff | Confirmed | Disputed | ManagerApproved
    public string? StaffNote { get; set; }
    public string? ManagerNote { get; set; }
    public DateTimeOffset? ConfirmedOn { get; set; }
    public Guid? ResolvedByUserId { get; set; }
    public DateTimeOffset? ResolvedOn { get; set; }
    public decimal TotalHours { get; set; }     // completed sessions within the period
    public int OpenSessions { get; set; }       // checked in but not out within the period
}

public class RequestTimesheetReviewsRequest
{
    public Guid ShopId { get; set; }
    public DateOnly From { get; set; }
    public DateOnly To { get; set; }
}

public class DisputeTimesheetReviewRequest
{
    public string Note { get; set; } = string.Empty;
}

public class ResolveTimesheetReviewRequest
{
    // True when the manager accepted the issue (e.g. fixed the times); false when it was rejected.
    // Only affects the message sent to the staff member — the new status comes from ReRequestConfirmation.
    public bool Approved { get; set; }
    public string? ManagerNote { get; set; }
    // True when the manager adjusted the times and wants the staff member to re-confirm.
    public bool ReRequestConfirmation { get; set; }
}

// Timesheet grouped by shift (Morning / Evening / Unrostered) instead of by staff.
public class ShiftTimesheetRowDto
{
    public string ShiftName { get; set; } = string.Empty;
    public DateOnly Date { get; set; }
    public TimeOnly? StartTime { get; set; }
    public TimeOnly? EndTime { get; set; }
    public int StaffCount { get; set; }        // distinct people who worked this shift
    public int ShiftsWorked { get; set; }      // completed sessions
    public int OpenSessions { get; set; }       // checked in but not out
    public decimal TotalHours { get; set; }     // sum of completed sessions (approved + pending)
    public decimal PendingHours { get; set; }   // portion of TotalHours awaiting approval
    public decimal? LabourCost { get; set; }    // Σ session hours × effective rate (null if not entitled)
    public decimal? PendingLabourCost { get; set; } // portion of LabourCost from unapproved sessions
    // Distinct non-regular assignment reasons across this shift's sessions, alphabetical.
    public List<string> Reasons { get; set; } = [];
}
