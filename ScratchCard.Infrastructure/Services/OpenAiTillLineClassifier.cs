using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Infrastructure.Services;

public class OpenAiTillLineClassifier : ITillLineAiClassifier
{
    // Light redaction before anything leaves our infrastructure: strip emails and long digit runs
    // (e.g. card/account numbers) that occasionally land in an OCR'd description.
    private static readonly Regex EmailRegex = new(@"\b[\w.+-]+@[\w-]+\.[\w.-]+\b", RegexOptions.Compiled);
    private static readonly Regex LongDigitsRegex = new(@"\d{7,}", RegexOptions.Compiled);

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly OpenAiOptions _options;
    private readonly ILogger<OpenAiTillLineClassifier> _logger;

    public OpenAiTillLineClassifier(
        IHttpClientFactory httpClientFactory,
        IOptions<OpenAiOptions> options,
        ILogger<OpenAiTillLineClassifier> logger)
    {
        _httpClientFactory = httpClientFactory;
        _options = options.Value;
        _logger = logger;
    }

    public async Task<IReadOnlyDictionary<int, TillLineClassification>> ClassifyAsync(
        IReadOnlyCollection<TillLineDescriptor> items,
        CancellationToken cancellationToken = default)
    {
        var empty = new Dictionary<int, TillLineClassification>();
        if (items.Count == 0)
        {
            return empty;
        }

        var apiKey = ResolveApiKey();
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            _logger.LogDebug("OpenAI key not configured; skipping AI till-line classification.");
            return empty;
        }

        try
        {
            var model = string.IsNullOrWhiteSpace(_options.Model) ? "gpt-4.1-mini" : _options.Model;
            var payload = BuildRequestPayload(model, items);
            var requestJson = JsonSerializer.Serialize(payload);

            using var request = new HttpRequestMessage(HttpMethod.Post, BuildEndpoint(_options.BaseUrl))
            {
                Content = new StringContent(requestJson, Encoding.UTF8, "application/json")
            };
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);

            var client = _httpClientFactory.CreateClient("OpenAI");
            using var response = await client.SendAsync(request, cancellationToken);
            var rawBody = await response.Content.ReadAsStringAsync(cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("OpenAI till-line classify failed with {StatusCode}.", (int)response.StatusCode);
                return empty;
            }

            return ParseResults(ExtractModelJson(rawBody));
        }
        catch (Exception ex)
        {
            // Non-fatal: fall back to manual tagging.
            _logger.LogWarning(ex, "AI till-line classification failed; falling back to manual tagging.");
            return empty;
        }
    }

    private static object BuildRequestPayload(string model, IReadOnlyCollection<TillLineDescriptor> items)
    {
        var lines = items.Select(x => new { id = x.Id, description = Redact(x.Description) }).ToArray();
        var linesJson = JsonSerializer.Serialize(lines);

        return new
        {
            model,
            temperature = 0,
            response_format = new { type = "json_object" },
            messages = new object[]
            {
                new
                {
                    role = "system",
                    content =
                        "You are a bookkeeping assistant for a UK convenience/newsagent shop. You classify " +
                        "till-report line descriptions as 'income' or 'expense'. Income = money the shop takes in " +
                        "(sales, takings, commission). Expense = money paid out (refunds, payouts, wages, supplier " +
                        "purchases, till shortages). You are given descriptions only — never amounts. Reply with JSON only."
                },
                new
                {
                    role = "user",
                    content =
                        "Classify each line by its id. Return strict JSON: " +
                        "{\"results\":[{\"id\":number,\"type\":\"income\"|\"expense\"|\"unknown\"}]}. " +
                        "Use \"unknown\" only when you genuinely cannot tell. Lines: " + linesJson
                }
            }
        };
    }

    private static string Redact(string description)
    {
        var value = description ?? string.Empty;
        value = EmailRegex.Replace(value, "[redacted]");
        value = LongDigitsRegex.Replace(value, "#");
        return value.Trim();
    }

    private static string BuildEndpoint(string? configuredBaseUrl)
    {
        var baseUrl = string.IsNullOrWhiteSpace(configuredBaseUrl) ? "https://api.openai.com" : configuredBaseUrl.Trim();
        var normalized = baseUrl.TrimEnd('/');
        return normalized.EndsWith("/v1", StringComparison.OrdinalIgnoreCase)
            ? $"{normalized}/chat/completions"
            : $"{normalized}/v1/chat/completions";
    }

    private static string ExtractModelJson(string rawBody)
    {
        using var doc = JsonDocument.Parse(rawBody);
        var choices = doc.RootElement.GetProperty("choices");
        if (choices.GetArrayLength() == 0)
        {
            return "{}";
        }

        var content = choices[0].GetProperty("message").GetProperty("content");
        return content.ValueKind == JsonValueKind.String ? content.GetString() ?? "{}" : "{}";
    }

    private static Dictionary<int, TillLineClassification> ParseResults(string json)
    {
        var map = new Dictionary<int, TillLineClassification>();
        using var doc = JsonDocument.Parse(json);
        if (!doc.RootElement.TryGetProperty("results", out var results) || results.ValueKind != JsonValueKind.Array)
        {
            return map;
        }

        foreach (var item in results.EnumerateArray())
        {
            if (!item.TryGetProperty("id", out var idElement) || !idElement.TryGetInt32(out var id))
            {
                continue;
            }

            var type = item.TryGetProperty("type", out var typeElement) ? typeElement.GetString() : null;
            var classification = type?.ToLowerInvariant() switch
            {
                "income" => TillLineClassification.Income,
                "expense" => TillLineClassification.Expense,
                _ => (TillLineClassification?)null
            };

            if (classification.HasValue)
            {
                map[id] = classification.Value;
            }
        }

        return map;
    }

    private string ResolveApiKey()
    {
        if (!string.IsNullOrWhiteSpace(_options.ApiKey))
        {
            return _options.ApiKey.Trim();
        }

        return Environment.GetEnvironmentVariable("OPENAI_API_KEY")?.Trim() ?? string.Empty;
    }
}
