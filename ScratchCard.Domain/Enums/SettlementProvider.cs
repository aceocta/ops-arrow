namespace ScratchCard.Domain.Enums;

/// <summary>A provider whose periodic statement (Direct Debit / commission) is reconciled against
/// captured daily totals.</summary>
public enum SettlementProvider
{
    PayPoint = 0,
    Payzone = 1,
    Lottery = 2,
    Parcels = 3,
}

/// <summary>State of a provider settlement period.</summary>
public enum SettlementStatus
{
    Open = 0,
    Matched = 1,
    Discrepancy = 2,
    Settled = 3,
}
