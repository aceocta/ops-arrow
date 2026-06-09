namespace ScratchCard.Domain.Enums;

/// <summary>What the requester is asking for.</summary>
public enum ShiftSwapType
{
    /// <summary>Trade my shift for the target's shift (both reassigned).</summary>
    Swap = 0,
    /// <summary>Give my shift away — the target takes it, I get nothing back.</summary>
    GiveAway = 1,
}

/// <summary>Lifecycle of a shift-swap request. Auto-completes on peer accept.</summary>
public enum ShiftSwapStatus
{
    Pending = 0,
    Completed = 1,
    Declined = 2,
    Cancelled = 3,
}
