using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.DTOs.Products;

// ---------------------------------------------------------------------------
// Categories + reminder rules
// ---------------------------------------------------------------------------
public class ProductCategoryDto
{
    public Guid Id { get; set; }
    public Guid? ShopId { get; set; }
    public string Name { get; set; } = string.Empty;
    public int SortOrder { get; set; }
    public bool IsActive { get; set; }
    public bool IsBuiltIn { get; set; }
    /// <summary>Reminder stages (days before expiry), descending — e.g. [30,14,7] or [7,3,0].</summary>
    public IReadOnlyList<int> ReminderDays { get; set; } = [];
}

public class CreateProductCategoryRequest
{
    public Guid ShopId { get; set; }
    public string Name { get; set; } = string.Empty;
    public int? SortOrder { get; set; }
    public IReadOnlyList<int> ReminderDays { get; set; } = [];
}

public class UpdateProductCategoryRequest
{
    public Guid Id { get; set; }
    public Guid ShopId { get; set; }
    public string Name { get; set; } = string.Empty;
    public int SortOrder { get; set; }
    public bool IsActive { get; set; } = true;
    public IReadOnlyList<int> ReminderDays { get; set; } = [];
}

// ---------------------------------------------------------------------------
// Products (added any time)
// ---------------------------------------------------------------------------
public class ProductBatchDto
{
    public Guid Id { get; set; }
    public Guid ShopId { get; set; }
    public Guid ProductCategoryId { get; set; }
    public string CategoryName { get; set; } = string.Empty;
    public string ProductName { get; set; } = string.Empty;
    public string? Barcode { get; set; }
    public int Quantity { get; set; }
    public int RemainingQuantity { get; set; }
    public DateOnly ExpiryDate { get; set; }
    public ProductDateType DateType { get; set; }
    public string? BatchNumber { get; set; }
    public decimal? UnitCost { get; set; }
    public decimal? UnitPrice { get; set; }
    /// <summary><see cref="ProductExpiryStatus"/> name, derived from days-to-expiry vs category rules.</summary>
    public string Status { get; set; } = string.Empty;
    public int DaysToExpiry { get; set; }
    public Guid AddedByUserId { get; set; }
    public DateTimeOffset AddedOn { get; set; }
    public IReadOnlyList<ProductExpiryActionDto> Actions { get; set; } = [];
}

/// <summary>Prefill suggestion from the most recent batch with a matching barcode (self-completing
/// catalogue). <see cref="Found"/> is false when the barcode hasn't been seen at this shop before.</summary>
public class ProductBarcodeLookupDto
{
    public bool Found { get; set; }
    /// <summary>"local" (a previous batch at this shop), "online" (external DB), or "none".</summary>
    public string Source { get; set; } = "none";
    public string Barcode { get; set; } = string.Empty;
    /// <summary>For an online match this already includes the brand (e.g. "Cadbury Dairy Milk").</summary>
    public string? ProductName { get; set; }
    public Guid? ProductCategoryId { get; set; }
    public string? CategoryName { get; set; }
    public ProductDateType? DateType { get; set; }
    public decimal? UnitCost { get; set; }
    public decimal? UnitPrice { get; set; }
}

public class AddProductRequest
{
    public Guid ShopId { get; set; }
    public Guid ProductCategoryId { get; set; }
    public string ProductName { get; set; } = string.Empty;
    public string? Barcode { get; set; }
    public int Quantity { get; set; }
    public DateOnly ExpiryDate { get; set; }
    public ProductDateType DateType { get; set; } = ProductDateType.UseBy;
    public string? BatchNumber { get; set; }
    public decimal? UnitCost { get; set; }
    public decimal? UnitPrice { get; set; }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
public class ProductExpiryActionDto
{
    public Guid Id { get; set; }
    public Guid ProductBatchId { get; set; }
    public string ActionType { get; set; } = string.Empty;
    public int Quantity { get; set; }
    public string? Comment { get; set; }
    public Guid PerformedByUserId { get; set; }
    public DateTimeOffset PerformedOn { get; set; }
}

public class RecordProductActionRequest
{
    public Guid ProductBatchId { get; set; }
    public ProductExpiryActionType ActionType { get; set; }
    public int Quantity { get; set; }
    public string? Comment { get; set; }
}

/// <summary>One recorded action in the flat history feed. Unlike the product list (active stock only),
/// this includes actions on batches that have since been fully cleared (remaining = 0) — so a 100%
/// binned/sold batch still shows. Newest first.</summary>
public class ProductActionHistoryDto
{
    public Guid Id { get; set; }
    public Guid ProductBatchId { get; set; }
    public string ProductName { get; set; } = string.Empty;
    public Guid ProductCategoryId { get; set; }
    public string CategoryName { get; set; } = string.Empty;
    public string? Barcode { get; set; }
    /// <summary><see cref="ProductExpiryActionType"/> name (e.g. "Discount", "Dispose", "MarkSold").</summary>
    public string ActionType { get; set; } = string.Empty;
    public int Quantity { get; set; }
    public string? Comment { get; set; }
    /// <summary>True for every action except Dispose (kept the item out of the bin).</summary>
    public bool IsSave { get; set; }
    /// <summary>True when the action removed units from the shelf (sold/donated/returned/disposed).</summary>
    public bool ReducesStock { get; set; }
    /// <summary>Estimated saved value (unit price) for saves, or estimated loss (unit cost) for disposals; 0 when unpriced.</summary>
    public decimal Value { get; set; }
    public DateOnly ExpiryDate { get; set; }
    public ProductDateType DateType { get; set; }
    public Guid PerformedByUserId { get; set; }
    public DateTimeOffset PerformedOn { get; set; }
}

// ---------------------------------------------------------------------------
// Binned-vs-saved scoreboard (the KPI)
// ---------------------------------------------------------------------------
public class ProductExpiryScoreboardDto
{
    public DateOnly From { get; set; }
    public DateOnly To { get; set; }
    public int BinnedUnits { get; set; }
    public decimal BinnedValue { get; set; }
    public int SavedUnits { get; set; }
    public decimal SavedValue { get; set; }
    /// <summary>saved ÷ (saved + binned), 0..1.</summary>
    public decimal SaveRate { get; set; }
    public IReadOnlyList<ProductExpiryDispositionDto> ByDisposition { get; set; } = [];
}

public class ProductExpiryDispositionDto
{
    public string ActionType { get; set; } = string.Empty;
    public int Units { get; set; }
    public decimal Value { get; set; }
    public bool IsSave { get; set; }
}
