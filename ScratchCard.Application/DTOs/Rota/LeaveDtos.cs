using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.DTOs.Rota;

// One leave (holiday / sick / unpaid / other) booking for a staff member.
public class LeaveRequestDto
{
    public Guid Id { get; set; }
    public Guid ShopId { get; set; }
    // Either UserId (registered) or RotaStaffMemberId (roster-only) is set.
    public Guid? UserId { get; set; }
    public Guid? RotaStaffMemberId { get; set; }
    public bool IsExternal { get; set; }
    public string UserName { get; set; } = string.Empty;
    public string Type { get; set; } = "Holiday"; // Holiday | Sick | Unpaid | Other
    public DateOnly StartDate { get; set; }
    public DateOnly EndDate { get; set; }
    public decimal HoursPerDay { get; set; }
    // Calendar days in the span (inclusive) and the resulting hours (days × hoursPerDay).
    public int TotalDays { get; set; }
    public decimal TotalHours { get; set; }
    public bool IsPaid { get; set; }
    public string Status { get; set; } = "Pending"; // Pending | Approved | Rejected | Cancelled
    public string? StaffNote { get; set; }
    public string? ManagerNote { get; set; }
    public Guid? DecidedByUserId { get; set; }
    public string? DecidedByName { get; set; }
    public DateTimeOffset? DecidedOn { get; set; }
    public DateTimeOffset RequestedOn { get; set; }
}

public class CreateLeaveRequest
{
    public Guid ShopId { get; set; }
    // Staff leave both null (the request is their own, created Pending). A manager sets exactly one
    // of UserId / RotaStaffMemberId to record leave on that person's behalf (created Approved).
    public Guid? UserId { get; set; }
    public Guid? RotaStaffMemberId { get; set; }
    public LeaveType Type { get; set; }
    public DateOnly StartDate { get; set; }
    public DateOnly EndDate { get; set; }
    // Hours off per day of the span (0.5–24).
    public decimal HoursPerDay { get; set; }
    public string? StaffNote { get; set; }
}

public class ApproveLeaveRequest
{
    public string? ManagerNote { get; set; }
    // Optional overrides applied at approval.
    public decimal? HoursPerDay { get; set; }
    public bool? IsPaid { get; set; }
}

public class RejectLeaveRequest
{
    public string ManagerNote { get; set; } = string.Empty;
}

// The person's leave balance for the entitlement year covering today (null result = no entitlement).
public class LeaveBalanceDto
{
    public DateOnly YearStart { get; set; }
    public decimal EntitledHours { get; set; }
    public decimal UsualHoursPerDay { get; set; }
    // Approved Holiday hours falling inside the entitlement year (days × hoursPerDay).
    public decimal UsedHours { get; set; }
    public decimal RemainingHours { get; set; }
}

public class LeaveEntitlementDto
{
    public Guid Id { get; set; }
    public Guid ShopId { get; set; }
    public Guid? UserId { get; set; }
    public Guid? RotaStaffMemberId { get; set; }
    public bool IsExternal { get; set; }
    public string UserName { get; set; } = string.Empty;
    public DateOnly YearStart { get; set; }
    public decimal EntitledHours { get; set; }
    public decimal UsualHoursPerDay { get; set; }
}

public class UpsertLeaveEntitlementRequest
{
    public Guid ShopId { get; set; }
    // Exactly one of UserId (registered) or RotaStaffMemberId (roster-only).
    public Guid? UserId { get; set; }
    public Guid? RotaStaffMemberId { get; set; }
    public DateOnly YearStart { get; set; }
    public decimal EntitledHours { get; set; }
    // 0 or omitted defaults to 8.
    public decimal UsualHoursPerDay { get; set; } = 8;
}

// One approved leave day (expanded per calendar day), fetched alongside timesheet sessions.
public class LeaveDayDto
{
    public DateOnly Date { get; set; }
    public string Type { get; set; } = "Holiday"; // Holiday | Sick | Unpaid | Other
    public decimal Hours { get; set; }
    public bool IsPaid { get; set; }
    public Guid LeaveRequestId { get; set; }
}
