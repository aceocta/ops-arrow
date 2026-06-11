namespace ScratchCard.Domain.Enums;

/// <summary>Lifecycle of a staff timesheet review (sign-off) for a pay period.</summary>
public enum RotaTimesheetReviewStatus
{
    /// <summary>Waiting for the staff member to confirm their hours (or raise an issue).</summary>
    PendingStaff = 0,
    /// <summary>The staff member confirmed their hours are correct.</summary>
    Confirmed = 1,
    /// <summary>The staff member raised an issue (see StaffNote); a manager must resolve it.</summary>
    Disputed = 2,
    /// <summary>A manager signed the row off (normal approval or override of an unresponsive member).</summary>
    ManagerApproved = 3,
}
