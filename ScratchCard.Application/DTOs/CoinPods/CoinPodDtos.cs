namespace ScratchCard.Application.DTOs.CoinPods;

// ---------------------------------------------------------------------------
// Dashboard + stock
// ---------------------------------------------------------------------------

/// <summary>The Coin Pod dashboard for a shop: one row per managed denomination plus headline totals.</summary>
public class CoinPodDashboardDto
{
    public Guid ShopId { get; set; }
    /// <summary>Sum of <see cref="CoinBagStockRowDto.CurrentTotalValue"/> across active denominations.</summary>
    public decimal TotalCoinValue { get; set; }
    public int ActiveAlertCount { get; set; }
    public IReadOnlyList<CoinBagStockRowDto> Items { get; set; } = [];
}

/// <summary>One denomination's live stock line on the dashboard (config + stock joined).</summary>
public class CoinBagStockRowDto
{
    public Guid CoinDenominationId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string DisplayLabel { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public int SortOrder { get; set; }
    public decimal BagValue { get; set; }
    /// <summary>The configured default (opening) bag quantity for this denomination.</summary>
    public int OpeningBagQuantity { get; set; }
    public int CurrentBagQuantity { get; set; }
    public decimal CurrentTotalValue { get; set; }
    public int StockAlertLimit { get; set; }
    public bool IsAlertEnabled { get; set; }
    public bool IsActive { get; set; }
    /// <summary>Derived: "Normal", "LowStock", "OutOfStock" or "Disabled".</summary>
    public string Status { get; set; } = string.Empty;
    public DateTimeOffset? LastUpdatedOn { get; set; }
    public Guid? LastUpdatedByUserId { get; set; }
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

public class CoinBagConfigDto
{
    public Guid Id { get; set; }
    public Guid ShopId { get; set; }
    public Guid CoinDenominationId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string DisplayLabel { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public decimal CoinValue { get; set; }
    public int SortOrder { get; set; }
    public decimal BagValue { get; set; }
    public int MinBagQuantity { get; set; }
    public int MaxBagQuantity { get; set; }
    public int OpeningBagQuantity { get; set; }
    public int StockAlertLimit { get; set; }
    public bool IsAlertEnabled { get; set; }
    /// <summary><see cref="Domain.Enums.CoinBagAlertRecipientType"/> name.</summary>
    public string AlertRecipientType { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public int CurrentBagQuantity { get; set; }
}

public class UpdateCoinBagConfigRequest
{
    public Guid ShopId { get; set; }
    public Guid CoinDenominationId { get; set; }
    public decimal BagValue { get; set; }
    public int MinBagQuantity { get; set; }
    public int MaxBagQuantity { get; set; }
    public int OpeningBagQuantity { get; set; }
    public int StockAlertLimit { get; set; }
    public bool IsAlertEnabled { get; set; } = true;
    /// <summary><see cref="Domain.Enums.CoinBagAlertRecipientType"/> name; defaults to OwnersAndManagers.</summary>
    public string? AlertRecipientType { get; set; }
    public bool IsActive { get; set; } = true;
}

// ---------------------------------------------------------------------------
// Movements (swaps / adjustments / bank)
// ---------------------------------------------------------------------------

/// <summary>Notes↔coins swap: take/return <see cref="BagQuantity"/> bags against <see cref="NoteAmount"/> notes.</summary>
public class CoinSwapRequest
{
    public Guid ShopId { get; set; }
    public Guid CoinDenominationId { get; set; }
    public int BagQuantity { get; set; }
    public decimal NoteAmount { get; set; }
    public string? Comment { get; set; }
}

public class CoinManualAdjustmentRequest
{
    public Guid ShopId { get; set; }
    public Guid CoinDenominationId { get; set; }
    /// <summary>True increases stock, false decreases it.</summary>
    public bool IncreaseStock { get; set; }
    public int BagQuantity { get; set; }
    /// <summary>Mandatory — manual adjustments always require a reason.</summary>
    public string Reason { get; set; } = string.Empty;
    public string? Comment { get; set; }
}

/// <summary>Bank refill (bags in) or coin removal/deposit (bags out) of full coin bags.</summary>
public class CoinBankMovementRequest
{
    public Guid ShopId { get; set; }
    public Guid CoinDenominationId { get; set; }
    public int BagQuantity { get; set; }
    public string? Comment { get; set; }
}

// ---------------------------------------------------------------------------
// Transactions + alerts
// ---------------------------------------------------------------------------

public class CoinBagTransactionDto
{
    public Guid Id { get; set; }
    public Guid ShopId { get; set; }
    public string TransactionNumber { get; set; } = string.Empty;
    public string TransactionType { get; set; } = string.Empty;
    public Guid CoinDenominationId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string DisplayLabel { get; set; } = string.Empty;
    public int BagQuantity { get; set; }
    public decimal BagValue { get; set; }
    public decimal TotalCoinValue { get; set; }
    public decimal NoteAmount { get; set; }
    public decimal DifferenceAmount { get; set; }
    public string Direction { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string? Comment { get; set; }
    public Guid PerformedByUserId { get; set; }
    public DateTimeOffset PerformedOn { get; set; }
}

public class CoinBagAlertDto
{
    public Guid Id { get; set; }
    public Guid ShopId { get; set; }
    public Guid CoinDenominationId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string DisplayLabel { get; set; } = string.Empty;
    public string AlertType { get; set; } = string.Empty;
    public int CurrentBagQuantity { get; set; }
    public int StockAlertLimit { get; set; }
    public string Status { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public DateTimeOffset TriggeredOn { get; set; }
    public DateTimeOffset? ResolvedOn { get; set; }
}

/// <summary>Reverse a previously recorded transaction (creates a compensating Reversal that restores stock).</summary>
public class CoinReverseTransactionRequest
{
    public Guid ShopId { get; set; }
    public Guid TransactionId { get; set; }
    public string Reason { get; set; } = string.Empty;
}

// ---------------------------------------------------------------------------
// Reports (coin_pod.reports)
// ---------------------------------------------------------------------------

public class CoinPodReportDto
{
    public Guid ShopId { get; set; }
    public DateOnly From { get; set; }
    public DateOnly To { get; set; }
    /// <summary>Current total coin bag value across active denominations (snapshot, not range-bound).</summary>
    public decimal TotalCoinValue { get; set; }
    /// <summary>Current stock per denomination (snapshot).</summary>
    public IReadOnlyList<CoinBagStockRowDto> StockSummary { get; set; } = [];
    /// <summary>Movement totals grouped by transaction type over the date range.</summary>
    public IReadOnlyList<CoinMovementSummaryRowDto> MovementSummary { get; set; } = [];
    /// <summary>Transactions in range where the notes amount didn't match the coin value.</summary>
    public IReadOnlyList<CoinBagTransactionDto> Exceptions { get; set; } = [];
    /// <summary>Alerts triggered in the date range.</summary>
    public IReadOnlyList<CoinBagAlertDto> Alerts { get; set; } = [];
}

public class CoinMovementSummaryRowDto
{
    public string TransactionType { get; set; } = string.Empty;
    public int Count { get; set; }
    public int TotalBags { get; set; }
    public decimal TotalCoinValue { get; set; }
    public decimal TotalNoteAmount { get; set; }
}
