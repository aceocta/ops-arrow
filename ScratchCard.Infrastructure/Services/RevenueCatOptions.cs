namespace ScratchCard.Infrastructure.Services;

public class RevenueCatOptions
{
    /// <summary>
    /// RevenueCat REST API key (a "secret" key). Used for server-to-server calls to
    /// https://api.revenuecat.com/v2/. Get this from RevenueCat → Project settings → API keys.
    /// </summary>
    public string? RestApiKey { get; set; }

    /// <summary>
    /// The literal Authorization header value RevenueCat is configured to send to our webhook
    /// endpoint. Set this in RevenueCat → Integrations → Webhooks → Authorization header. We
    /// reject any webhook request whose Authorization header does not match.
    /// </summary>
    public string? WebhookAuthorization { get; set; }

    /// <summary>Project ID used when calling v2 REST endpoints (optional, only needed for some endpoints).</summary>
    public string? ProjectId { get; set; }

    /// <summary>
    /// Default base URL. RevenueCat exposes both v1 (subscriber-centric) and v2 (project-centric)
    /// APIs at https://api.revenuecat.com.
    /// </summary>
    public string BaseUrl { get; set; } = "https://api.revenuecat.com";
}
