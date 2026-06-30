using Google.Apis.Auth.OAuth2;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Models;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace ScratchCard.Infrastructure.Services;

public class FirebasePushSender : IPushSender
{
    private const string FirebaseMessagingScope = "https://www.googleapis.com/auth/firebase.messaging";

    private static readonly JsonSerializerOptions SerializerOptions = new()
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private readonly HttpClient _httpClient;
    private readonly FirebasePushOptions _options;
    private readonly ILogger<FirebasePushSender> _logger;
    private readonly SemaphoreSlim _credentialLock = new(1, 1);
    private GoogleCredential? _credential;
    private readonly IConfiguration _configuration;
    public FirebasePushSender(
        HttpClient httpClient,
        IOptions<FirebasePushOptions> options,
        ILogger<FirebasePushSender> logger,
        IConfiguration configuration)
    {
        _httpClient = httpClient;
        _options = options.Value;
        _logger = logger;
        _configuration = configuration;
    }

    public async Task SendAsync(NotificationMessage message, CancellationToken cancellationToken = default)
    {
        if (!_options.Enabled)
        {
            _logger.LogInformation("Firebase push notifications are disabled. Skipping push delivery.");
            return;
        }

        if (string.IsNullOrWhiteSpace(_options.ProjectId))
        {
            throw new InvalidOperationException("FirebasePush:ProjectId is required.");
        }

        if (string.IsNullOrWhiteSpace(message.Recipient))
        {
            throw new InvalidOperationException("Push recipient token is required.");
        }

        var accessToken = await GetAccessTokenAsync(cancellationToken);
        var endpoint = $"https://fcm.googleapis.com/v1/projects/{Uri.EscapeDataString(_options.ProjectId.Trim())}/messages:send";
        var payload = new FirebaseSendRequest
        {
            Message = new FirebaseMessage
            {
                Token = message.Recipient.Trim(),
                Notification = new FirebaseNotification
                {
                    Title = message.Subject,
                    Body = message.Body
                },
                // Carried through to the device so the app can deep-link on tap (e.g. open the
                // Temperature Log screen for a TemperatureLogReminder). All values must be strings.
                Data = new Dictionary<string, string>
                {
                    ["shopId"] = message.ShopId.ToString(),
                    ["notificationType"] = message.NotificationType.ToString(),
                    ["relatedEntityName"] = message.RelatedEntityName,
                    ["relatedEntityId"] = message.RelatedEntityId?.ToString() ?? string.Empty
                },
                Android = new FirebaseAndroidConfig
                {
                    Priority = "high",
                    Notification = new FirebaseAndroidNotification
                    {
                        Sound = "default",
                        // ChannelId = "default"
                    }
                }
            }
        };

        using var request = new HttpRequestMessage(HttpMethod.Post, endpoint)
        {
            Content = JsonContent.Create(payload, options: SerializerOptions)
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        using var response = await _httpClient.SendAsync(request, cancellationToken);
        if (response.IsSuccessStatusCode)
        {
            return;
        }

        var responseText = await response.Content.ReadAsStringAsync(cancellationToken);
        var parsed = string.IsNullOrWhiteSpace(responseText)
            ? null
            : JsonSerializer.Deserialize<FirebaseErrorEnvelope>(responseText, SerializerOptions);
        var failureMessage = parsed?.Error?.Message;
        if (string.IsNullOrWhiteSpace(failureMessage))
        {
            failureMessage = responseText;
        }

        throw new InvalidOperationException(
            $"Firebase push request failed with status {(int)response.StatusCode}: {failureMessage}");
    }

    private async Task<string> GetAccessTokenAsync(CancellationToken cancellationToken)
    {
        var credential = await ResolveCredentialAsync(cancellationToken);
        var token = await credential.UnderlyingCredential.GetAccessTokenForRequestAsync(null, cancellationToken);
        if (string.IsNullOrWhiteSpace(token))
        {
            throw new InvalidOperationException("Unable to acquire Firebase access token.");
        }

        return token;
    }

    //private async Task<GoogleCredential> ResolveCredentialAsync(CancellationToken cancellationToken)
    //{
    //    if (_credential is not null)
    //    {
    //        return _credential;
    //    }

    //    await _credentialLock.WaitAsync(cancellationToken);
    //    try
    //    {
    //        if (_credential is not null)
    //        {
    //            return _credential;
    //        }

    //        GoogleCredential credential;
    //        if (!string.IsNullOrWhiteSpace(_options.ServiceAccountJson))
    //        {
    //            credential = GoogleCredential.FromJson(_options.ServiceAccountJson);
    //        }
    //        else if (!string.IsNullOrWhiteSpace(_options.ServiceAccountFilePath))
    //        {
    //            credential = GoogleCredential.FromFile(_options.ServiceAccountFilePath);
    //        }
    //        else
    //        {
    //            credential = await GoogleCredential.GetApplicationDefaultAsync(cancellationToken);
    //        }

    //        _credential = credential.CreateScoped(FirebaseMessagingScope);
    //        return _credential;
    //    }
    //    finally
    //    {
    //        _credentialLock.Release();
    //    }
    //}

    private async Task<GoogleCredential> ResolveCredentialAsync(CancellationToken cancellationToken)
    {
        if (_credential is not null)
        {
            return _credential;
        }

        await _credentialLock.WaitAsync(cancellationToken);
        try
        {
            if (_credential is not null)
            {
                return _credential;
            }

            GoogleCredential credential;
            var base64 = _configuration["FirebasePush:CredentialsBase64"] ?? _configuration["Firebase:CredentialsBase64"];

            if (!string.IsNullOrWhiteSpace(base64))
            {
                var json = Encoding.UTF8.GetString(Convert.FromBase64String(base64));
                credential = GoogleCredential.FromJson(json);
            }
            else if (!string.IsNullOrWhiteSpace(_options.ServiceAccountJson))
            {
                credential = GoogleCredential.FromJson(_options.ServiceAccountJson);
            }
            else if (!string.IsNullOrWhiteSpace(_options.ServiceAccountFilePath))
            {
                var credentialPath = _options.ServiceAccountFilePath;

                if (!Path.IsPathRooted(credentialPath))
                {
                    credentialPath = Path.Combine(AppContext.BaseDirectory, credentialPath);
                }

                credential = GoogleCredential.FromFile(credentialPath);
            }
            else
            {
                credential = await GoogleCredential.GetApplicationDefaultAsync(cancellationToken);
            }

            _credential = credential.CreateScoped(FirebaseMessagingScope);
            return _credential;
        }
        finally
        {
            _credentialLock.Release();
        }
    }
    private sealed class FirebaseSendRequest
    {
        [JsonPropertyName("message")]
        public FirebaseMessage Message { get; set; } = new();
    }

    private sealed class FirebaseMessage
    {
        [JsonPropertyName("token")]
        public string Token { get; set; } = string.Empty;

        [JsonPropertyName("notification")]
        public FirebaseNotification Notification { get; set; } = new();

        [JsonPropertyName("data")]
        public Dictionary<string, string>? Data { get; set; }

        [JsonPropertyName("android")]
        public FirebaseAndroidConfig? Android { get; set; }
    }

    private sealed class FirebaseNotification
    {
        [JsonPropertyName("title")]
        public string Title { get; set; } = string.Empty;

        [JsonPropertyName("body")]
        public string Body { get; set; } = string.Empty;
    }

    private sealed class FirebaseAndroidConfig
    {
        [JsonPropertyName("priority")]
        public string Priority { get; set; } = "high";

        [JsonPropertyName("notification")]
        public FirebaseAndroidNotification Notification { get; set; } = new();
    }

    private sealed class FirebaseAndroidNotification
    {
        [JsonPropertyName("sound")]
        public string Sound { get; set; } = "default";

        [JsonPropertyName("channel_id")]
        public string ChannelId { get; set; } = "default";
    }

    private sealed class FirebaseErrorEnvelope
    {
        [JsonPropertyName("error")]
        public FirebaseError? Error { get; set; }
    }

    private sealed class FirebaseError
    {
        [JsonPropertyName("message")]
        public string? Message { get; set; }
    }
}
