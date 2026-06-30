using ScratchCard.Domain.Common;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Domain.Entities;

/// <summary>
/// An immutable record of one coin-bag movement (opening balance, notes↔coins swap, manual
/// adjustment, bank refill/deposit, reversal). Every stock-changing action writes one of these.
/// Incorrect entries are cancelled or reversed (status change), never hard-deleted.
/// </summary>
public class CoinBagTransaction : AuditableEntity
{
    public Guid ShopId { get; set; }
    /// <summary>Human-readable reference, e.g. "CP-20260630-AB12".</summary>
    public string TransactionNumber { get; set; } = string.Empty;
    public CoinBagTransactionType TransactionType { get; set; }
    public Guid CoinDenominationId { get; set; }

    public int BagQuantity { get; set; }
    public decimal BagValue { get; set; }
    public decimal TotalCoinValue { get; set; }
    /// <summary>Notes received (notes→coins) or given out (coins→notes); 0 for non-swap movements.</summary>
    public decimal NoteAmount { get; set; }
    /// <summary>NoteAmount − TotalCoinValue. Non-zero needs a reason (recorded in <see cref="Comment"/>).</summary>
    public decimal DifferenceAmount { get; set; }
    public CoinBagTransactionDirection Direction { get; set; }
    public CoinBagTransactionStatus Status { get; set; } = CoinBagTransactionStatus.Active;
    public string? Comment { get; set; }

    public Guid PerformedByUserId { get; set; }
    public DateTimeOffset PerformedOn { get; set; } = DateTimeOffset.UtcNow;

    public DateTimeOffset? CancelledOn { get; set; }
    public Guid? CancelledByUserId { get; set; }
    public string? CancellationReason { get; set; }

    public Shop? Shop { get; set; }
    public CoinDenomination CoinDenomination { get; set; } = null!;
}
