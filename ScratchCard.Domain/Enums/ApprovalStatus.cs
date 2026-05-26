namespace ScratchCard.Domain.Enums;

// Generic approval status used by anything that flows through a manager-approval workflow
// (PrizePayout, CanisterDrop, etc.).
public enum ApprovalStatus
{
    Pending = 1,
    Approved = 2,
    Rejected = 3
}
