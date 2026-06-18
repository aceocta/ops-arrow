using ScratchCard.Application.Common.Models;

namespace ScratchCard.Application.Common.Interfaces;

/// <summary>Best-effort external product-database lookup by barcode (GTIN). Implementations must never
/// throw — return null on miss, timeout, or error so the add-product flow is never blocked.</summary>
public interface IBarcodeProductLookup
{
    Task<BarcodeProductInfo?> LookupAsync(string barcode, CancellationToken cancellationToken = default);
}
