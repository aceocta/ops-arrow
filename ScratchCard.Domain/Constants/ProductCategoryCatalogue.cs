namespace ScratchCard.Domain.Constants;

/// <summary>A built-in product category with its default expiry reminder stages (days before expiry).</summary>
public sealed record ProductCategorySeed(string Name, int SortOrder, IReadOnlyList<int> ReminderDaysBeforeExpiry);

/// <summary>
/// Built-in product categories seeded as global defaults (ShopId null, read-only) on first run.
/// Each carries sensible reminder stages a shop can later customise per-category.
/// </summary>
public static class ProductCategoryCatalogue
{
    public static readonly IReadOnlyList<ProductCategorySeed> Defaults = new[]
    {
        new ProductCategorySeed("Dairy", 1, new[] { 7, 3, 0 }),
        new ProductCategorySeed("Bakery", 2, new[] { 3, 1, 0 }),
        new ProductCategorySeed("Chocolate", 3, new[] { 30, 14, 7 }),
        new ProductCategorySeed("Crisps", 4, new[] { 30, 14, 7 }),
        new ProductCategorySeed("Frozen Food", 5, new[] { 60, 30, 7 }),
        new ProductCategorySeed("Baby Products", 6, new[] { 30, 14, 7 }),
        new ProductCategorySeed("Health Items", 7, new[] { 30, 14, 7 }),
    };
}
