using ScratchCard.Domain.Common;

namespace ScratchCard.Domain.Entities;

/// <summary>
/// One reminder stage for a product category: surface/alert this many days before a batch's expiry
/// date (0 = on the expiry day). A category has several stages (e.g. dairy 7/3/0, chocolate 30/14/7).
/// </summary>
public class ProductExpiryReminderRule : AuditableEntity
{
    public Guid ProductCategoryId { get; set; }
    public int DaysBeforeExpiry { get; set; }

    public ProductCategory ProductCategory { get; set; } = null!;
}
