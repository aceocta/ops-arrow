namespace ScratchCard.Application.Common.Models;

/// <summary>Product details resolved from an external barcode database (e.g. Open Food Facts).</summary>
public sealed record BarcodeProductInfo(string Name, string? Brand, string? CategoryHint);
