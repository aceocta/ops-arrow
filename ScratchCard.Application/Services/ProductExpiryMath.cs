using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.Services;

/// <summary>
/// Pure product-expiry arithmetic, kept out of the DB-coupled service so it can be unit-tested.
/// The feature's goal is to reduce items binned out of date, so this also classifies which actions
/// "save" an item (keep it out of the bin) vs which bin it.
///
/// Status is derived from days-to-expiry vs the category's reminder stages:
///   Expired      — past the expiry date
///   Urgent       — within (≤) the most-urgent reminder stage (smallest "days before")
///   ExpiringSoon — within (≤) the earliest reminder stage (largest "days before")
///   Safe         — beyond all stages
/// With no rules configured, an item is Safe until the expiry day (Urgent), then Expired.
/// </summary>
public static class ProductExpiryMath
{
    public static int DaysToExpiry(DateOnly expiry, DateOnly today) => expiry.DayNumber - today.DayNumber;

    public static ProductExpiryStatus StatusOf(DateOnly expiry, DateOnly today, IReadOnlyCollection<int> reminderDays)
    {
        var days = DaysToExpiry(expiry, today);
        if (days < 0) return ProductExpiryStatus.Expired;
        if (reminderDays is null || reminderDays.Count == 0)
            return days == 0 ? ProductExpiryStatus.Urgent : ProductExpiryStatus.Safe;

        var min = reminderDays.Min();
        var max = reminderDays.Max();
        if (days <= min) return ProductExpiryStatus.Urgent;
        if (days <= max) return ProductExpiryStatus.ExpiringSoon;
        return ProductExpiryStatus.Safe;
    }

    /// <summary>True if the action kept the item out of the bin (anything except Dispose).</summary>
    public static bool IsSaveAction(ProductExpiryActionType action) => action != ProductExpiryActionType.Dispose;

    /// <summary>True if the action removes units from the shelf (reduces remaining stock). Move-to-front
    /// and Discount leave the item on shelf; sold/donated/returned/disposed remove it.</summary>
    public static bool ReducesStock(ProductExpiryActionType action) => action switch
    {
        ProductExpiryActionType.MoveToFront => false,
        ProductExpiryActionType.Discount => false,
        _ => true,
    };

    /// <summary>Estimated loss from binned (disposed) stock — 0 when no unit cost was captured.</summary>
    public static decimal EstimatedLoss(int disposedQuantity, decimal? unitCost)
        => unitCost.HasValue ? disposedQuantity * unitCost.Value : 0m;

    /// <summary>Value saved by selling/discounting/donating/returning before the bin — 0 when no unit price.</summary>
    public static decimal SavedValue(int savedQuantity, decimal? unitPrice)
        => unitPrice.HasValue ? savedQuantity * unitPrice.Value : 0m;

    /// <summary>Save rate = saved ÷ (saved + binned), the headline KPI. 1.0 when nothing was binned.</summary>
    public static decimal SaveRate(int savedUnits, int binnedUnits)
    {
        var total = savedUnits + binnedUnits;
        return total <= 0 ? 1m : (decimal)savedUnits / total;
    }
}
