using System.Net.Http.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Models;

namespace ScratchCard.Infrastructure.Services;

public class BrevoEmailSender : IEmailSender
{
    private readonly HttpClient _httpClient;
    private readonly EmailOptions _options;
    private readonly ILogger<BrevoEmailSender> _logger;

    public BrevoEmailSender(HttpClient httpClient, IOptions<EmailOptions> options, ILogger<BrevoEmailSender> logger)
    {
        _httpClient = httpClient;
        _options = options.Value;
        _logger = logger;
    }

    public Task SendAsync(string recipient, string subject, string body, CancellationToken cancellationToken = default)
        => SendAsync(new EmailMessage
        {
            Recipient = recipient,
            Subject = subject,
            Body = body,
            IsBodyHtml = false
        }, cancellationToken);

    public async Task SendAsync(EmailMessage message, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(_options.BrevoApiKey))
        {
            throw new InvalidOperationException("Brevo email provider is selected, but Email:BrevoApiKey is not configured.");
        }

        var baseUrl = string.IsNullOrWhiteSpace(_options.BrevoBaseUrl)
            ? "https://api.brevo.com"
            : _options.BrevoBaseUrl.TrimEnd('/');
        var endpoint = $"{baseUrl}/v3/smtp/email";

        var payload = new BrevoSendEmailRequest
        {
            Sender = new BrevoSender
            {
                Email = _options.FromAddress,
                Name = _options.FromName
            },
            To =
            [
                new BrevoRecipient { Email = message.Recipient }
            ],
            Subject = message.Subject,
            HtmlContent = message.IsBodyHtml ? message.Body : null,
            TextContent = message.IsBodyHtml ? null : message.Body,
            Attachment = message.Attachments
                .Where(x => x.Content.Length > 0 && !string.IsNullOrWhiteSpace(x.FileName))
                .Select(x => new BrevoAttachment
                {
                    Name = x.FileName,
                    Content = Convert.ToBase64String(x.Content)
                })
                .ToArray()
        };

        using var request = new HttpRequestMessage(HttpMethod.Post, endpoint);
        request.Headers.Add("api-key", _options.BrevoApiKey);
        //request.Content = JsonContent.Create(payload);

        request.Content = JsonContent.Create(
    payload,
    options: new System.Text.Json.JsonSerializerOptions
    {
        PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase
    });
        var json = System.Text.Json.JsonSerializer.Serialize(
    payload,
    new System.Text.Json.JsonSerializerOptions
    {
        PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase,
        WriteIndented = true
    });

        using var response = await _httpClient.SendAsync(request, cancellationToken);
        if (response.IsSuccessStatusCode)
        {
            return;
        }

        var responseText = await response.Content.ReadAsStringAsync(cancellationToken);
        _logger.LogError(
            "Brevo email send failed with status {StatusCode}. Recipient: {Recipient}. Body: {ResponseBody}",
            (int)response.StatusCode,
            message.Recipient,
            responseText);

        throw new InvalidOperationException($"Brevo email send failed with status {(int)response.StatusCode}.");
    }

    private sealed class BrevoSendEmailRequest
    {
        [JsonPropertyName("sender")]
        public BrevoSender Sender { get; set; } = new();

        [JsonPropertyName("to")]
        public BrevoRecipient[] To { get; set; } = [];

        [JsonPropertyName("subject")]
        public string Subject { get; set; } = string.Empty;

        [JsonPropertyName("htmlContent")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? HtmlContent { get; set; }

        [JsonPropertyName("textContent")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? TextContent { get; set; }

        [JsonPropertyName("attachment")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public BrevoAttachment[]? Attachment { get; set; }
    }

    private sealed class BrevoSender
    {
        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;

        [JsonPropertyName("email")]
        public string Email { get; set; } = string.Empty;
    }

    private sealed class BrevoRecipient
    {
        [JsonPropertyName("email")]
        public string Email { get; set; } = string.Empty;
    }

    private sealed class BrevoAttachment
    {
        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;

        [JsonPropertyName("content")]
        public string Content { get; set; } = string.Empty;
    }
}
