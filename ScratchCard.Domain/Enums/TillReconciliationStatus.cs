namespace ScratchCard.Domain.Enums;

/// <summary>Lifecycle of a till reconciliation (a shift/day for one till).</summary>
public enum TillReconciliationStatus
{
    Draft = 0,
    NeedsVerification = 1,
    Reconciled = 2,
    Approved = 3,
}

/// <summary>How a reconciliation line's figure was captured.</summary>
public enum TillCaptureMethod
{
    Manual = 0,
    Photo = 1,
    Export = 2,
}

/// <summary>Whether a captured line still needs a human to confirm the amount/mapping.</summary>
public enum TillLineStatus
{
    Captured = 0,
    Verified = 1,
}

/// <summary>Variance banding against the shop's tolerance.</summary>
public enum TillVarianceStatus
{
    Ok = 0,
    Warning = 1,
    Alert = 2,
}
