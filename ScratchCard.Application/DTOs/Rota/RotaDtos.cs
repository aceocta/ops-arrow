namespace ScratchCard.Application.DTOs.Rota;

public class RotaAssigneeDto
{
    public Guid UserId { get; set; }
    public string Name { get; set; } = string.Empty;
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

public class CreateRotaShiftRequest
{
    public Guid ShopId { get; set; }
    public DateOnly ShiftDate { get; set; }
    public string ShiftTemplateId { get; set; } = string.Empty;
    public string? Position { get; set; }
    public string? Notes { get; set; }
    public IReadOnlyCollection<Guid> AssigneeUserIds { get; set; } = [];
}

public class UpdateRotaShiftRequest
{
    public Guid ShopId { get; set; }
    public DateOnly ShiftDate { get; set; }
    public string ShiftTemplateId { get; set; } = string.Empty;
    public string? Position { get; set; }
    public string? Notes { get; set; }
    public IReadOnlyCollection<Guid> AssigneeUserIds { get; set; } = [];
}

public class ShiftAttendanceDto
{
    public Guid Id { get; set; }
    public Guid ShopId { get; set; }
    public Guid UserId { get; set; }
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
    public Guid UserId { get; set; }
    public string UserName { get; set; } = string.Empty;
    public string? ShiftName { get; set; }
    public DateOnly? ShiftDate { get; set; }
    public DateTimeOffset CheckInAt { get; set; }
    public DateTimeOffset? CheckOutAt { get; set; }
    public string? Notes { get; set; }
}

public class AssignableUserDto
{
    public Guid UserId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
}

// Rostered-vs-worked view for one business day (shown on the day-close / business-day screen).
public class BusinessDayStaffRowDto
{
    public Guid UserId { get; set; }
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
    public Guid UserId { get; set; }
    public string UserName { get; set; } = string.Empty;
    public int ShiftsWorked { get; set; }      // attendance records that were checked out
    public int OpenSessions { get; set; }       // checked in but not out
    public decimal TotalHours { get; set; }     // sum of completed sessions
}
