using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using ScratchCard.Application.Common.Services;

namespace ScratchCard.Infrastructure.Services;

/// <summary>
/// Verifies an IAP receipt by querying the RevenueCat REST API for the subscriber's current
/// entitlement status. RevenueCat itself talks to App Store / Play; we trust RevenueCat as the
/// source of truth.
/// </summary>
public sealed class RevenueCatReceiptVerifier : IIapReceiptVerifier
{
    private readonly HttpClient _httpClient;
    private readonly RevenueCatOptions _options;
    private readonly ILogger<RevenueCatReceiptVerifier> _logger;

    public RevenueCatReceiptVerifier(HttpClient httpClient, IOptions<RevenueCatOptions> options, ILogger<RevenueCatReceiptVerifier> logger)
    {
        _httpClient = httpClient;
        _options = options.Value;
        _logger = logger;
    }

    public async Task<IapReceiptVerification> VerifyAsync(IapReceiptVerificationRequest request, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(_options.RestApiKey))
        {
            _logger.LogWarning("RevenueCat:RestApiKey is not configured; receipts cannot be verified.");
            return new IapReceiptVerification { IsValid = false, Reason = "RevenueCat REST API key not configured." };
        }

        // The mobile client passes the active shopId as the RevenueCat appUserId via Purchases.logIn(),
        // and sends it back to us as OriginalTransactionId or PurchaseToken depending on platform.
        // We use it to query the subscriber state from RevenueCat.
        var appUserId = request.OriginalTransactionId ?? request.PurchaseToken ?? request.TransactionId;
        if (string.IsNullOrWhiteSpace(appUserId))
        {
            return new IapReceiptVerification { IsValid = false, Reason = "No appUserId on the receipt." };
        }

        try
        {
            using var httpRequest = new HttpRequestMessage(HttpMethod.Get, $"{_options.BaseUrl.TrimEnd('/')}/v1/subscribers/{Uri.EscapeDataString(appUserId)}");
            httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _options.RestApiKey);

            using var response = await _httpClient.SendAsync(httpRequest, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                var body = await response.Content.ReadAsStringAsync(cancellationToken);
                _logger.LogWarning("RevenueCat verification failed: {Status} {Body}", (int)response.StatusCode, body);
                return new IapReceiptVerification { IsValid = false, Reason = $"RevenueCat returned {(int)response.StatusCode}." };
            }

            var payload = await response.Content.ReadFromJsonAsync<SubscriberResponse>(cancellationToken: cancellationToken);
            var subscriber = payload?.Subscriber;
            if (subscriber?.Entitlements is null || subscriber.Entitlements.Count == 0)
            {
                return new IapReceiptVerification { IsValid = false, Reason = "Subscriber has no active entitlements." };
            }

            // Pick the latest active entitlement.
            var now = DateTimeOffset.UtcNow;
            var active = subscriber.Entitlements
                .Where(kv => !kv.Value.ExpiresDate.HasValue || kv.Value.ExpiresDate.Value > now)
                .Select(kv => kv.Value)
                .OrderByDescending(e => e.PurchaseDate ?? DateTimeOffset.MinValue)
                .FirstOrDefault();

            if (active is null)
            {
                return new IapReceiptVerification { IsValid = false, Reason = "No entitlement is currently active." };
            }

            return new IapReceiptVerification
            {
                IsValid = true,
                ResolvedProductId = active.ProductIdentifier ?? request.ProductId,
                PurchaseDate = active.PurchaseDate,
                ExpiresDate = active.ExpiresDate,
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "RevenueCat verification threw.");
            return new IapReceiptVerification { IsValid = false, Reason = "RevenueCat verification failed." };
        }
    }

    private sealed class SubscriberResponse
    {
        [JsonPropertyName("subscriber")] public Subscriber? Subscriber { get; set; }
    }

    private sealed class Subscriber
    {
        [JsonPropertyName("entitlements")] public Dictionary<string, Entitlement>? Entitlements { get; set; }
    }

    private sealed class Entitlement
    {
        [JsonPropertyName("product_identifier")] public string? ProductIdentifier { get; set; }
        [JsonPropertyName("purchase_date")] public DateTimeOffset? PurchaseDate { get; set; }
        [JsonPropertyName("expires_date")] public DateTimeOffset? ExpiresDate { get; set; }
    }
}
