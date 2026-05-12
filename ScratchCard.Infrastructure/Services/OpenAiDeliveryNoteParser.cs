using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Models;
using ScratchCard.Domain.Constants;

namespace ScratchCard.Infrastructure.Services;

public class OpenAiDeliveryNoteParser : IDeliveryNoteAiParser
{
    private const string ParseErrorCode = ErrorCodes.DeliveryNoteParseFailed;
    private const string ConfigurationErrorCode = ErrorCodes.DeliveryNoteAiNotConfigured;

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly OpenAiOptions _options;
    private readonly ILogger<OpenAiDeliveryNoteParser> _logger;

    public OpenAiDeliveryNoteParser(
        IHttpClientFactory httpClientFactory,
        IOptions<OpenAiOptions> options,
        ILogger<OpenAiDeliveryNoteParser> logger)
    {
        _httpClientFactory = httpClientFactory;
        _options = options.Value;
        _logger = logger;
    }

    public async Task<DeliveryNoteAiParseResult> ParseAsync(
        byte[] imageBytes,
        string contentType,
        string fileName,
        CancellationToken cancellationToken = default)
    {
        var apiKey = ResolveApiKey();
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            throw new AppException(
                ConfigurationErrorCode,
                "OpenAI API key is not configured. Set OpenAI:ApiKey or OPENAI_API_KEY.",
                500);
        }

        var model = string.IsNullOrWhiteSpace(_options.Model) ? "gpt-4.1-mini" : _options.Model;
        var imageDataUrl = BuildImageDataUrl(imageBytes, contentType);
        var requestPayload = BuildRequestPayload(model, imageDataUrl, fileName);
        var requestJson = JsonSerializer.Serialize(requestPayload);

        var endpoint = BuildEndpoint(_options.BaseUrl);
        using var request = new HttpRequestMessage(HttpMethod.Post, endpoint)
        {
            Content = new StringContent(requestJson, Encoding.UTF8, "application/json")
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);

        var client = _httpClientFactory.CreateClient("OpenAI");
        using var response = await client.SendAsync(request, cancellationToken);
        var rawBody = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            _logger.LogError(
                "OpenAI parse request failed with {StatusCode}. Body: {Body}",
                (int)response.StatusCode,
                rawBody);
            throw new AppException(ParseErrorCode, "Unable to parse delivery note image right now.", 502);
        }

        var modelJson = ExtractModelJson(rawBody);
        return ParseStructuredResult(modelJson);
    }

    private static object BuildRequestPayload(string model, string imageDataUrl, string fileName) => new
    {
        model,
        temperature = 0,
        response_format = new
        {
            type = "json_object"
        },
        messages = new object[]
        {
            new
            {
                role = "system",
                content =
                    "You extract structured fields from UK National Lottery instant ticket delivery receipts. " +
                    "Return JSON only."
            },
            new
            {
                role = "user",
                content = new object[]
                {
                    new
                    {
                        type = "text",
                        text =
                            "Extract fields from this delivery note image. " +
                            "Return strict JSON with this exact shape: " +
                            "{ \"supplier_name\": string, \"shipment_number\": string, \"delivery_reference\": string, \"delivery_date_text\": string, " +
                            "\"pairs\": [{ \"game_code\": string, \"game_name\": string, \"pack_number\": string, \"price_point\": number, \"raw_text\": string, \"confidence\": number }] }. " +
                            "If uncertain, still return best guess with lower confidence. " +
                            "In pairs, use game and pack tokens like '1467' and '0021797'. " +
                            "Map each pair to the price point from Order Details by game code."
                    },
                    new
                    {
                        type = "image_url",
                        image_url = new
                        {
                            url = imageDataUrl
                        }
                    },
                    new
                    {
                        type = "text",
                        text = $"Filename: {fileName}"
                    }
                }
            }
        }
    };

    private static string BuildImageDataUrl(byte[] imageBytes, string contentType)
    {
        var safeContentType = string.IsNullOrWhiteSpace(contentType) ? "image/jpeg" : contentType.Trim();
        var base64 = Convert.ToBase64String(imageBytes);
        return $"data:{safeContentType};base64,{base64}";
    }

    private static string BuildEndpoint(string? configuredBaseUrl)
    {
        var baseUrl = string.IsNullOrWhiteSpace(configuredBaseUrl) ? "https://api.openai.com" : configuredBaseUrl.Trim();
        var normalized = baseUrl.TrimEnd('/');
        if (normalized.EndsWith("/v1", StringComparison.OrdinalIgnoreCase))
        {
            return $"{normalized}/chat/completions";
        }

        return $"{normalized}/v1/chat/completions";
    }

    private static string ExtractModelJson(string rawBody)
    {
        try
        {
            using var rootDoc = JsonDocument.Parse(rawBody);
            var root = rootDoc.RootElement;
            var choices = root.GetProperty("choices");
            if (choices.GetArrayLength() == 0)
            {
                throw new AppException(ParseErrorCode, "AI response was empty.");
            }

            var message = choices[0].GetProperty("message");
            var contentElement = message.GetProperty("content");
            string? content = null;

            if (contentElement.ValueKind == JsonValueKind.String)
            {
                content = contentElement.GetString();
            }
            else if (contentElement.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in contentElement.EnumerateArray())
                {
                    if (!item.TryGetProperty("text", out var textPart))
                    {
                        continue;
                    }

                    content = textPart.GetString();
                    if (!string.IsNullOrWhiteSpace(content))
                    {
                        break;
                    }
                }
            }

            if (string.IsNullOrWhiteSpace(content))
            {
                throw new AppException(ParseErrorCode, "AI response did not include parsed content.");
            }

            return content;
        }
        catch (AppException)
        {
            throw;
        }
        catch (Exception)
        {
            throw new AppException(ParseErrorCode, "Failed to process AI response.");
        }
    }

    private static DeliveryNoteAiParseResult ParseStructuredResult(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;

            var result = new DeliveryNoteAiParseResult
            {
                SupplierName = root.TryGetProperty("supplier_name", out var supplier) ? supplier.GetString() ?? string.Empty : string.Empty,
                ShipmentNumber = root.TryGetProperty("shipment_number", out var shipment) ? shipment.GetString() ?? string.Empty : string.Empty,
                DeliveryReference = root.TryGetProperty("delivery_reference", out var reference) ? reference.GetString() ?? string.Empty : string.Empty,
                DeliveryDateText = root.TryGetProperty("delivery_date_text", out var dateText) ? dateText.GetString() ?? string.Empty : string.Empty
            };

            if (root.TryGetProperty("pairs", out var pairs) && pairs.ValueKind == JsonValueKind.Array)
            {
                var parsedPairs = new List<DeliveryNoteAiPair>();
                foreach (var pair in pairs.EnumerateArray())
                {
                    decimal confidenceValue = 0;
                    if (pair.TryGetProperty("confidence", out var confidence))
                    {
                        if (confidence.ValueKind == JsonValueKind.Number && confidence.TryGetDecimal(out var decimalValue))
                        {
                            confidenceValue = decimalValue;
                        }
                        else if (confidence.ValueKind == JsonValueKind.Number && confidence.TryGetDouble(out var doubleValue))
                        {
                            confidenceValue = (decimal)doubleValue;
                        }
                    }

                    decimal? pricePoint = null;
                    if (pair.TryGetProperty("price_point", out var priceToken))
                    {
                        if (priceToken.ValueKind == JsonValueKind.Number && priceToken.TryGetDecimal(out var decimalPrice))
                        {
                            pricePoint = decimalPrice;
                        }
                        else if (priceToken.ValueKind == JsonValueKind.Number && priceToken.TryGetDouble(out var doublePrice))
                        {
                            pricePoint = (decimal)doublePrice;
                        }
                        else if (priceToken.ValueKind == JsonValueKind.String)
                        {
                            var raw = priceToken.GetString() ?? string.Empty;
                            var normalized = Regex.Replace(raw, @"[^0-9.]", string.Empty);
                            if (decimal.TryParse(normalized, out var parsedPrice))
                            {
                                pricePoint = parsedPrice;
                            }
                        }
                    }

                    parsedPairs.Add(new DeliveryNoteAiPair
                    {
                        GameCode = pair.TryGetProperty("game_code", out var gameCode) ? gameCode.GetString() ?? string.Empty : string.Empty,
                        GameName = pair.TryGetProperty("game_name", out var gameName) ? gameName.GetString() ?? string.Empty : string.Empty,
                        PackNumber = pair.TryGetProperty("pack_number", out var packNumber) ? packNumber.GetString() ?? string.Empty : string.Empty,
                        PricePoint = pricePoint,
                        RawText = pair.TryGetProperty("raw_text", out var rawText) ? rawText.GetString() ?? string.Empty : string.Empty,
                        Confidence = confidenceValue
                    });
                }

                result.Pairs = parsedPairs;
            }

            return result;
        }
        catch (Exception)
        {
            throw new AppException(ParseErrorCode, "Failed to parse structured AI output.");
        }
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
