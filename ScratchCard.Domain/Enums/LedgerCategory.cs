namespace ScratchCard.Domain.Enums;

/// <summary>Where a canonical field posts in the books. The crux of correct accounting: agency
/// throughput (PayPoint/Lottery/PO) is a <see cref="Liability"/>, NOT <see cref="Sales"/>; only
/// commission is <see cref="Income"/>.</summary>
public enum LedgerCategory
{
    /// <summary>Tenders — money received into bank/clearing.</summary>
    Bank = 0,
    /// <summary>Taxable turnover (departments, carrier bags, fuel).</summary>
    Sales = 1,
    /// <summary>Your earned income (commission).</summary>
    Income = 2,
    /// <summary>Money paid out as a cost/expense.</summary>
    Expense = 3,
    /// <summary>Agency money owed to a provider — a balance-sheet liability, not turnover.</summary>
    Liability = 4,
    /// <summary>Cash over/short.</summary>
    Variance = 5,
    /// <summary>Cash movement / informational — not a P&amp;L posting.</summary>
    Memo = 6,
    /// <summary>Excluded entirely (totals, subtotals, unmapped).</summary>
    Ignore = 7,
}
