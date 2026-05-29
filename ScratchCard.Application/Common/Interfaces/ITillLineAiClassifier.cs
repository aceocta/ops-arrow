namespace ScratchCard.Application.Common.Interfaces;

public interface ITillLineAiClassifier
{
    /// <summary>
    /// Decides the bookkeeping role of till-report line descriptions. Only the (redacted)
    /// description text is sent to the provider — never the amount. Returns a map of the supplied
    /// item id to the decision; ids the model couldn't decide are omitted. Never throws: on any
    /// failure (not configured, provider error) it returns an empty map so callers fall back to
    /// manual tagging.
    /// </summary>
    Task<IReadOnlyDictionary<int, TillLineAiDecision>> ClassifyAsync(
        IReadOnlyCollection<TillLineDescriptor> items,
        CancellationToken cancellationToken = default);
}

public sealed record TillLineDescriptor(int Id, string Description);

public sealed record TillLineAiDecision(
    TillLineAiCategory Category,
    string? TenderKind,
    string? SaleKind);

public enum TillLineAiCategory
{
    Unknown = 0,
    // Money the shop took in for goods/services.
    Sale = 1,
    // A reduction applied to a sale (promo, manager/staff discount).
    Discount = 2,
    // Money returned to the customer (refund, return, void, reversal).
    Refund = 3,
    // Deliberate cash movement out of the till (supplier paid, wages, lottery prize paid, etc.).
    Payout = 4,
    // Operational loss/cost (drive-off, spillage, breakage, till short, no-sale).
    Expense = 5,
    // A tender breakdown line (how takings were paid). TenderKind names the bucket.
    Tender = 6,
    // A roll-up / total / subtotal / balance / change / rounding line. Must be ignored.
    Summary = 7
}
