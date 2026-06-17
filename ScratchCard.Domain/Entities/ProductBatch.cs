using ScratchCard.Domain.Common;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Domain.Entities;

/// <summary>
/// A product with an expiry date, added any time (no delivery dependency). The displayed status
/// (Safe / Expiring Soon / Urgent / Expired) is DERIVED at read time from days-to-expiry vs the
/// category's reminder rules — never stored — so re-configuring a category re-grades existing stock.
/// </summary>
public class ProductBatch : SoftDeletableAuditableEntity
{
    public Guid ShopId { get; set; }
    public Guid ProductCategoryId { get; set; }
    public string ProductName { get; set; } = string.Empty;
    public string? Barcode { get; set; }
    public int Quantity { get; set; }
    /// <summary>Units still on shelf — decremented by save/dispose actions.</summary>
    public int RemainingQuantity { get; set; }
    public DateOnly ExpiryDate { get; set; }
    public ProductDateType DateType { get; set; } = ProductDateType.UseBy;
    public string? BatchNumber { get; set; }
    /// <summary>Optional cost per unit — drives estimated-loss reporting when present.</summary>
    public decimal? UnitCost { get; set; }
    /// <summary>Optional retail price per unit — drives saved-value reporting when present.</summary>
    public decimal? UnitPrice { get; set; }
    public Guid AddedByUserId { get; set; }
    public DateTimeOffset AddedOn { get; set; } = DateTimeOffset.UtcNow;

    public Shop? Shop { get; set; }
    public ProductCategory ProductCategory { get; set; } = null!;
    public ICollection<ProductExpiryAction> Actions { get; set; } = new List<ProductExpiryAction>();
}
