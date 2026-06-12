namespace ScratchCard.Domain.Enums;

/// <summary>What kind of leave a <see cref="Entities.LeaveRequest"/> covers.</summary>
public enum LeaveType
{
    Holiday = 0,
    Sick = 1,
    Unpaid = 2,
    Other = 3,
}

/// <summary>Lifecycle of a leave request. Manager-recorded leave is created directly Approved.</summary>
public enum LeaveRequestStatus
{
    Pending = 0,
    Approved = 1,
    Rejected = 2,
    Cancelled = 3,
}
