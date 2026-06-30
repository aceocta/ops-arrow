namespace ScratchCard.Domain.Constants;

/// <summary>
/// A built-in UK coin denomination plus the default per-shop bag configuration applied when a shop
/// first opens its Coin Pod. <paramref name="CoinValue"/> is the face value of a single coin;
/// <paramref name="DefaultBagValue"/> is the cash value of one full bag.
/// </summary>
public sealed record CoinDenominationSeed(
    string Code,
    string Name,
    string DisplayLabel,
    decimal CoinValue,
    int SortOrder,
    decimal DefaultBagValue,
    int DefaultOpeningBagQuantity,
    int DefaultMinBagQuantity,
    int DefaultMaxBagQuantity,
    int DefaultStockAlertLimit);

/// <summary>
/// The eight supported UK coin denominations seeded as global read-only reference data on first run,
/// each with sensible default bag settings a shop can later customise. Values mirror the Coin Pod
/// specification (section 4).
/// </summary>
public static class CoinDenominationCatalogue
{
    public static readonly IReadOnlyList<CoinDenominationSeed> Defaults = new[]
    {
        //                     Code        Name          Label  Coin   Sort  Bag£  Open  Min  Max  Alert
        new CoinDenominationSeed("GBP_1P",  "One Penny",   "1p",  0.01m, 1,    1m,   10,   2,   20,  2),
        new CoinDenominationSeed("GBP_2P",  "Two Pence",   "2p",  0.02m, 2,    1m,   10,   2,   20,  2),
        new CoinDenominationSeed("GBP_5P",  "Five Pence",  "5p",  0.05m, 3,    5m,   8,    2,   16,  2),
        new CoinDenominationSeed("GBP_10P", "Ten Pence",   "10p", 0.10m, 4,    5m,   8,    2,   16,  2),
        new CoinDenominationSeed("GBP_20P", "Twenty Pence","20p", 0.20m, 5,    10m,  5,    1,   10,  1),
        new CoinDenominationSeed("GBP_50P", "Fifty Pence", "50p", 0.50m, 6,    10m,  5,    1,   10,  1),
        new CoinDenominationSeed("GBP_1",   "One Pound",   "£1",  1.00m, 7,    20m,  10,   2,   20,  2),
        new CoinDenominationSeed("GBP_2",   "Two Pounds",  "£2",  2.00m, 8,    20m,  5,    1,   10,  1),
    };
}
