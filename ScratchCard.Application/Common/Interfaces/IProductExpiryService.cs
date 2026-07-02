using ScratchCard.Application.DTOs.Products;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.Common.Interfaces;

/// <summary>Product categories + their per-category expiry reminder rules. Built-ins are global and
/// read-only; custom categories belong to a shop (managed by owner/manager).</summary>
public interface IProductCategoryService
{
    /// <summary>Built-in categories + the shop's own custom categories, each with reminder stages.</summary>
    Task<IReadOnlyCollection<ProductCategoryDto>> ListAsync(Guid shopId, CancellationToken cancellationToken = default);
    Task<ProductCategoryDto> CreateAsync(CreateProductCategoryRequest request, CancellationToken cancellationToken = default);
    Task<ProductCategoryDto> UpdateAsync(UpdateProductCategoryRequest request, CancellationToken cancellationToken = default);
    Task DeleteAsync(Guid id, CancellationToken cancellationToken = default);
}

/// <summary>Adding product batches (any time), listing them by derived expiry status, recording staff
/// "save" actions, and the binned-vs-saved scoreboard.</summary>
public interface IProductExpiryService
{
    Task<ProductBatchDto> AddAsync(AddProductRequest request, CancellationToken cancellationToken = default);
    /// <summary>Edit an existing batch's details. Re-derives RemainingQuantity from the new total minus the
    /// units already actioned; rejects a total below what's already been actioned.</summary>
    Task<ProductBatchDto> UpdateAsync(UpdateProductRequest request, CancellationToken cancellationToken = default);
    /// <summary>Prefill suggestion for a scanned barcode from the most recent matching batch at this shop.</summary>
    Task<ProductBarcodeLookupDto> LookupByBarcodeAsync(Guid shopId, string barcode, CancellationToken cancellationToken = default);
    /// <summary>Active (remaining > 0, non-deleted) batches for a shop, with derived status; optional status filter.</summary>
    Task<IReadOnlyCollection<ProductBatchDto>> ListAsync(Guid shopId, ProductExpiryStatus? status, CancellationToken cancellationToken = default);
    Task<ProductBatchDto> GetAsync(Guid id, CancellationToken cancellationToken = default);
    Task<ProductBatchDto> RecordActionAsync(RecordProductActionRequest request, CancellationToken cancellationToken = default);
    /// <summary>Flat action history feed over a date range (by action PerformedOn), newest first. Includes
    /// actions on fully-cleared batches (remaining = 0), unlike <see cref="ListAsync"/>.</summary>
    Task<IReadOnlyCollection<ProductActionHistoryDto>> GetActionHistoryAsync(Guid shopId, DateOnly from, DateOnly to, CancellationToken cancellationToken = default);
    /// <summary>Binned-vs-saved KPI over a date range (by action PerformedOn), plus per-disposition breakdown.</summary>
    Task<ProductExpiryScoreboardDto> GetScoreboardAsync(Guid shopId, DateOnly from, DateOnly to, CancellationToken cancellationToken = default);
}
