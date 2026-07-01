using ScratchCard.Application.DTOs.CoinPods;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.Common.Interfaces;

/// <summary>
/// Coin Pod: per-shop coin bag stock management. Bag config, live stock dashboard, notes↔coins swaps,
/// manual adjustments, bank refill/removal, transaction history and low/out-of-stock alerts. Per-shop
/// role + coin_pod feature gates are enforced inside the service.
/// </summary>
public interface ICoinPodService
{
    /// <summary>Live dashboard (one row per active denomination + totals). Lazily seeds this shop's
    /// config + stock rows from the catalogue defaults on first access.</summary>
    Task<CoinPodDashboardDto> GetDashboardAsync(Guid shopId, CancellationToken cancellationToken = default);

    /// <summary>Full per-denomination configuration for the shop (management view).</summary>
    Task<IReadOnlyCollection<CoinBagConfigDto>> GetConfigAsync(Guid shopId, CancellationToken cancellationToken = default);

    /// <summary>Update one denomination's bag config / alert settings (manager/owner only).</summary>
    Task<CoinBagConfigDto> UpdateConfigAsync(UpdateCoinBagConfigRequest request, CancellationToken cancellationToken = default);

    /// <summary>Notes → coins: take bags out, record notes received. Decreases stock, may raise an alert.</summary>
    Task<CoinBagTransactionDto> SwapNotesToCoinsAsync(CoinSwapRequest request, CancellationToken cancellationToken = default);

    /// <summary>Coins → notes: return bags, record notes given out. Increases stock, may resolve an alert.</summary>
    Task<CoinBagTransactionDto> SwapCoinsToNotesAsync(CoinSwapRequest request, CancellationToken cancellationToken = default);

    /// <summary>Manual correction (manager/owner only). Always requires a reason.</summary>
    Task<CoinBagTransactionDto> AdjustAsync(CoinManualAdjustmentRequest request, CancellationToken cancellationToken = default);

    /// <summary>Bank refill — full bags received from the bank/supplier (increases stock).</summary>
    Task<CoinBagTransactionDto> BankRefillAsync(CoinBankMovementRequest request, CancellationToken cancellationToken = default);

    /// <summary>Coin removal / bank deposit — bags removed for banking (decreases stock).</summary>
    Task<CoinBagTransactionDto> BankRemovalAsync(CoinBankMovementRequest request, CancellationToken cancellationToken = default);

    /// <summary>Value-based stocktake: convert each entered cash value to a pack count (value ÷ pack
    /// value) and SET current stock to it. Returns the refreshed dashboard.</summary>
    Task<CoinPodDashboardDto> RecordStockByValueAsync(RecordCoinStockRequest request, CancellationToken cancellationToken = default);

    /// <summary>Transaction history over a date range, newest first; optional denomination filter.</summary>
    Task<IReadOnlyCollection<CoinBagTransactionDto>> GetTransactionsAsync(Guid shopId, DateOnly from, DateOnly to, Guid? coinDenominationId, CancellationToken cancellationToken = default);

    /// <summary>Reverse an active transaction (manager/owner only). Creates a compensating Reversal that
    /// restores stock and marks the original Reversed. Always requires a reason.</summary>
    Task<CoinBagTransactionDto> ReverseTransactionAsync(CoinReverseTransactionRequest request, CancellationToken cancellationToken = default);

    /// <summary>Coin Pod report over a date range: current stock summary, movement totals by type,
    /// note/coin mismatch exceptions and alert history. Manager/owner only; gated by coin_pod.reports.</summary>
    Task<CoinPodReportDto> GetReportAsync(Guid shopId, DateOnly from, DateOnly to, CancellationToken cancellationToken = default);

    /// <summary>Alert centre feed; optional status filter (Active / Resolved / Dismissed).</summary>
    Task<IReadOnlyCollection<CoinBagAlertDto>> GetAlertsAsync(Guid shopId, CoinBagAlertStatus? status, CancellationToken cancellationToken = default);

    /// <summary>Dismiss an active alert (manager/owner only).</summary>
    Task<CoinBagAlertDto> DismissAlertAsync(Guid shopId, Guid alertId, CancellationToken cancellationToken = default);
}
