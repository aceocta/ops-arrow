namespace ScratchCard.Domain.Enums;

/// <summary>The kind of coin-bag movement a <c>CoinBagTransaction</c> records.</summary>
public enum CoinBagTransactionType
{
    OpeningBalance = 1,
    NotesToCoins = 2,
    CoinsToNotes = 3,
    ManualAdjustment = 4,
    BankRefill = 5,
    BankDeposit = 6,
    Reversal = 7,
    /// <summary>A value-based stock count that sets current stock to the counted quantity.</summary>
    StockCount = 8,
}

/// <summary>Whether a transaction added coin bags to (In) or removed them from (Out) the shop.</summary>
public enum CoinBagTransactionDirection
{
    In = 1,
    Out = 2,
}

/// <summary>Lifecycle of a coin-bag transaction. Incorrect entries are cancelled/reversed, never deleted.</summary>
public enum CoinBagTransactionStatus
{
    Active = 1,
    Cancelled = 2,
    Reversed = 3,
}

/// <summary>Low-stock alert severity. Out-of-stock is treated as the more urgent of the two.</summary>
public enum CoinBagAlertType
{
    LowStock = 1,
    OutOfStock = 2,
}

/// <summary>Lifecycle of a coin-bag stock alert.</summary>
public enum CoinBagAlertStatus
{
    Active = 1,
    Resolved = 2,
    Dismissed = 3,
}

/// <summary>Who receives low/out-of-stock alerts for a denomination at a shop.</summary>
public enum CoinBagAlertRecipientType
{
    OwnersAndManagers = 1,
    OwnersOnly = 2,
    ManagersOnly = 3,
}
