using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;

namespace ScratchCard.Infrastructure.Services;

/// <summary>
/// Sends messages via Meta's WhatsApp Business Cloud API:
///   POST https://graph.facebook.com/{ApiVersion}/{PhoneNumberId}/messages
///
/// Production messages MUST use a pre-approved template — Meta blocks free-text outside the
/// 24-hour customer-initiated window. The template path renders the supplied body into the
/// configured template's first body parameter ({{1}}).
/// </summary>
public sealed class MetaWhatsAppSender : IWhatsAppSender
{
    private readonly HttpClient _httpClient;
    private readonly MetaWhatsAppOptions _options;
    private readonly ILogger<MetaWhatsAppSender> _logger;

    public MetaWhatsAppSender(HttpClient httpClient, IOptions<MetaWhatsAppOptions> options, ILogger<MetaWhatsAppSender> logger)
    {
        _httpClient = httpClient;
        _options = options.Value ?? new MetaWhatsAppOptions();
        _logger = logger;

        if (string.IsNullOrWhiteSpace(_options.AccessToken) || string.IsNullOrWhiteSpace(_options.PhoneNumberId))
        {
            throw new InvalidOperationException(
                "MetaWhatsAppSender requires WhatsApp:AccessToken and WhatsApp:PhoneNumberId. " +
                "Either configure both or fall back to NoopWhatsAppSender via DI.");
        }
    }

    public async Task SendAsync(string recipientPhone, string messageBody, CancellationToken cancellationToken = default)
    {
        var normalised = PhoneNumberNormaliser.NormaliseE164(recipientPhone);
        if (string.IsNullOrWhiteSpace(normalised))
        {
            _logger.LogWarning("WhatsApp send skipped: recipient phone '{Phone}' is invalid.", recipientPhone);
            return;
        }

        if (string.IsNullOrWhiteSpace(messageBody))
        {
            _logger.LogWarning("WhatsApp send skipped: empty message body for {Phone}.", normalised);
            return;
        }

        var endpoint = $"{_options.ApiVersion}/{_options.PhoneNumberId}/messages";
        var payload = BuildPayload(normalised, messageBody);

        using var request = new HttpRequestMessage(HttpMethod.Post, endpoint)
        {
            Content = JsonContent.Create(payload),
        };
        request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _options.AccessToken);

        using var response = await _httpClient.SendAsync(request, cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            _logger.LogError(
                "Meta WhatsApp send failed for {Phone}. Status: {Status}. Body: {Body}",
                normalised, (int)response.StatusCode, body);

            // Surface as AppException so the notification pipeline records it as Failed.
            throw new AppException(
                "whatsapp_send_failed",
                $"Meta WhatsApp API returned {(int)response.StatusCode}.",
                500);
        }

        // Useful in dev to confirm the message id; cheap in prod (logs are scoped/structured already).
        if (_logger.IsEnabled(LogLevel.Debug))
        {
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            _logger.LogDebug("Meta WhatsApp accepted message for {Phone}: {Body}", normalised, body);
        }
    }

    private object BuildPayload(string normalisedPhone, string messageBody)
    {
        if (_options.UseTextFallback)
        {
            // Free-text path — only works within the 24h customer-initiated window. Useful
            // against the WhatsApp test number when the user has just messaged it.
            return new
            {
                messaging_product = "whatsapp",
                to = normalisedPhone,
                type = "text",
                text = new { body = messageBody },
            };
        }

        if (string.IsNullOrWhiteSpace(_options.TemplateName))
        {
            // No template configured; refuse to send rather than silently failing at Meta with
            // an opaque "template not found" error.
            throw new InvalidOperationException(
                "WhatsApp:TemplateName is required when UseTextFallback is false. Approve a template " +
                "in Meta Business Manager and set the name here.");
        }

        // Standard template body with a single text parameter {{1}}.
        return new
        {
            messaging_product = "whatsapp",
            to = normalisedPhone,
            type = "template",
            template = new
            {
                name = _options.TemplateName,
                language = new { code = _options.TemplateLanguage },
                components = new[]
                {
                    new
                    {
                        type = "body",
                        parameters = new[]
                        {
                            new { type = "text", text = messageBody },
                        },
                    },
                },
            },
        };
    }
}
