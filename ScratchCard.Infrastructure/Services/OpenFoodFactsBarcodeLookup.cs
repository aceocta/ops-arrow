using System.Net.Http.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Models;

namespace ScratchCard.Infrastructure.Services;

/// <summary>
/// Resolves a product name (and a best-guess category) from the free, open Open Food Facts database
/// by barcode. Best-effort: switchable via config (<c>ProductExpiry:OnlineLookup</c>, default on),
/// short timeout, results (incl. misses) cached, every failure swallowed — so a slow/unreachable
/// third party never blocks adding a product.
/// </summary>
public sealed class OpenFoodFactsBarcodeLookup : IBarcodeProductLookup
{
    private static readonly TimeSpan CacheTtl = TimeSpan.FromDays(7);
    private readonly HttpClient _http;
    private readonly IMemoryCache _cache;
    private readonly ILogger<OpenFoodFactsBarcodeLookup> _logger;
    private readonly bool _enabled;

    public OpenFoodFactsBarcodeLookup(HttpClient http, IMemoryCache cache, IConfiguration configuration, ILogger<OpenFoodFactsBarcodeLookup> logger)
    {
        _http = http;
        _cache = cache;
        _logger = logger;
        _enabled = configuration.GetValue("ProductExpiry:OnlineLookup", true);
    }

    public async Task<BarcodeProductInfo?> LookupAsync(string barcode, CancellationToken cancellationToken = default)
    {
        if (!_enabled) return null;

        // Open Food Facts stores EAN-13/UPC as printed, so strip the GTIN-14 leading-zero padding.
        var code = (barcode ?? string.Empty).Trim().TrimStart('0');
        if (code.Length is < 6 or > 14 || !code.All(char.IsAsciiDigit)) return null;

        var cacheKey = $"off-barcode:{code}";
        if (_cache.TryGetValue(cacheKey, out BarcodeProductInfo? cached)) return cached;

        BarcodeProductInfo? info = null;
        try
        {
            var url = $"api/v2/product/{code}.json?fields=product_name,brands,categories_tags";
            var resp = await _http.GetFromJsonAsync<OffResponse>(url, cancellationToken);
            if (resp?.Status == 1 && resp.Product is { } p && !string.IsNullOrWhiteSpace(p.ProductName))
            {
                var brand = string.IsNullOrWhiteSpace(p.Brands) ? null : p.Brands.Split(',')[0].Trim();
                info = new BarcodeProductInfo(p.ProductName!.Trim(), brand, MapCategory(p.CategoriesTags));
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw; // genuine caller cancellation (request aborted) — propagate, don't swallow as a "miss"
        }
        catch (Exception ex)
        {
            // Swallows the internal HttpClient.Timeout cancellation and any HTTP/parse failure.
            _logger.LogDebug(ex, "Open Food Facts lookup failed for {Code}", code);
            return null; // don't cache transient failures
        }

        // Cache hits AND confirmed misses (null) so we don't hammer the API for the same barcode.
        _cache.Set(cacheKey, info, CacheTtl);
        return info;
    }

    /// <summary>Map Open Food Facts category tags onto one of our built-in category names, or null.</summary>
    private static string? MapCategory(IEnumerable<string>? tags)
    {
        if (tags is null) return null;
        foreach (var raw in tags)
        {
            var t = raw.ToLowerInvariant();
            if (t.Contains("dairy") || t.Contains("milk") || t.Contains("yogurt") || t.Contains("yoghurt") || t.Contains("cheese") || t.Contains("butter") || t.Contains("cream")) return "Dairy";
            if (t.Contains("bread") || t.Contains("baker") || t.Contains("pastr") || t.Contains("cake") || t.Contains("viennoiser")) return "Bakery";
            if (t.Contains("chocolate")) return "Chocolate";
            if (t.Contains("crisp") || t.Contains("chips") || t.Contains("snack")) return "Crisps";
            if (t.Contains("frozen")) return "Frozen Food";
            if (t.Contains("baby") || t.Contains("infant")) return "Baby Products";
            if (t.Contains("supplement") || t.Contains("vitamin") || t.Contains("health") || t.Contains("pharmac")) return "Health Items";
        }
        return null;
    }

    private sealed class OffResponse
    {
        [JsonPropertyName("status")] public int Status { get; set; }
        [JsonPropertyName("product")] public OffProduct? Product { get; set; }
    }

    private sealed class OffProduct
    {
        [JsonPropertyName("product_name")] public string? ProductName { get; set; }
        [JsonPropertyName("brands")] public string? Brands { get; set; }
        [JsonPropertyName("categories_tags")] public List<string>? CategoriesTags { get; set; }
    }
}
