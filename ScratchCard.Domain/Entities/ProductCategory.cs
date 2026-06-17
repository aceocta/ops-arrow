using ScratchCard.Domain.Common;

namespace ScratchCard.Domain.Entities;

/// <summary>
/// A product category (Dairy, Bakery, Chocolate, …) that drives expiry reminder rules. Built-in
/// categories have a null <see cref="ShopId"/> (seeded, available to all shops, read-only); custom
/// categories belong to one shop. Each category owns a set of <see cref="ProductExpiryReminderRule"/>
/// stages applied to every batch in that category.
/// </summary>
public class ProductCategory : SoftDeletableAuditableEntity
{
    /// <summary>Null = global built-in (all shops); set = a custom category owned by that shop.</summary>
    public Guid? ShopId { get; set; }
    public string Name { get; set; } = string.Empty;
    public int SortOrder { get; set; }
    public bool IsActive { get; set; } = true;
    public bool IsBuiltIn { get; set; }

    public Shop? Shop { get; set; }
    public ICollection<ProductExpiryReminderRule> ReminderRules { get; set; } = new List<ProductExpiryReminderRule>();
}
