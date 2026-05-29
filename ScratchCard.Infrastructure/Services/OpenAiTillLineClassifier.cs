using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using ScratchCard.Application.Common.Helpers;
using ScratchCard.Application.Common.Interfaces;

namespace ScratchCard.Infrastructure.Services;

public class OpenAiTillLineClassifier : ITillLineAiClassifier
{
    // Light redaction before anything leaves our infrastructure: strip emails and long digit runs
    // (e.g. card/account numbers) that occasionally land in an OCR'd description.
    private static readonly Regex EmailRegex = new(@"\b[\w.+-]+@[\w-]+\.[\w.-]+\b", RegexOptions.Compiled);
    private static readonly Regex LongDigitsRegex = new(@"\d{7,}", RegexOptions.Compiled);

    private const string SystemPrompt =
        """
        You are a bookkeeping assistant for a UK convenience store / newsagent / petrol forecourt.
        Your job is to classify each till-report line by its DESCRIPTION ONLY (you are never given
        amounts), so the shop can track where money comes in and where it goes out.

        For every line, choose ONE category from the list below. If you genuinely cannot tell,
        return "unknown" — never guess wildly.

        CATEGORIES

        1. sale
           Money the shop takes in for goods or services sold.
           Subcategorise the sale type when obvious (see "sale_kind" below).
           Examples: "Fuel Sales", "Unleaded", "Diesel", "Super Unleaded", "AdBlue",
           "Grocery", "Tobacco", "Alcohol", "Confectionery", "Soft Drinks",
           "Newspaper", "Magazine", "Lottery Sales", "National Lottery", "Scratchcards",
           "Instants", "Paypoint", "Top-up", "Mobile Top-up", "Hot Food", "Coffee", "Off-Sales".

        2. discount
           Money taken OFF a sale — reduces what the customer pays.
           Examples: "Discount", "Manager Discount", "Staff Discount", "Promotion", "Promo",
           "Multibuy Saving", "Meal Deal Saving", "Loyalty Discount", "Coupon", "Voucher Redeemed".

        3. refund
           Money returned to a customer (cancelled/returned sale).
           Examples: "Refund", "Return", "Reversal", "Void", "Voided Sale",
           "Transaction Cancelled", "Cancellation", "Error Correct" (when it reverses a sale).

        4. payout
           Money paid OUT of the till for a deliberate, legitimate reason (a movement, not a loss).
           Examples: "Paid Out", "Pay Out", "Supplier Paid", "Cash to Safe", "Change Order",
           "Float Top-up", "Bank Lodgement", "Wages", "Staff Pay", "Petty Cash",
           "Lottery Prize Paid", "Scratchcard Prize Paid", "Lotto Payout".

        5. expense
           Money lost or spent operationally — typically a loss the shop absorbs (NOT a payout).
           Examples: "Drive Off", "Drive-Off", "No Pay", "Fuel Theft", "Spillage", "Breakage",
           "Wastage", "Damaged Stock", "Till Short", "Cash Short", "Shortage",
           "No Sale" (records an unaccounted till open).

        6. tender
           Records HOW takings were paid (the breakdown by payment method). Also return a
           "tender_kind" from this list:
             cash, card, credit_card, debit_card, fuel_card, mobile, voucher, cheque, account, other
           Examples:
             "Cash", "Cash Tendered" -> tender / cash
             "Card", "Chip & Pin", "Contactless", "Visa", "Mastercard" -> tender / card
             "Credit", "Credit Card" -> tender / credit_card
             "Debit", "Debit Card" -> tender / debit_card
             "Fuel Card", "BP Card", "Shell Card", "Allstar", "Keyfuels" -> tender / fuel_card
             "Apple Pay", "Google Pay" -> tender / mobile
             "Gift Voucher", "Gift Card" -> tender / voucher
             "Cheque" -> tender / cheque

        7. summary
           A roll-up / total / subtotal line. NEVER store these — they aggregate other lines.
           Examples: "Total", "Subtotal", "Sub Total", "Grand Total", "Total Sales",
           "Net Sales", "Gross Sales", "Net Total", "Total Tendered", "Amount Tendered",
           "Balance", "Change", "Change Due", "Rounding", "VAT Total" (when it's report-wide).

        8. unknown
           You genuinely can't tell. Use sparingly.

        DISAMBIGUATION RULES (apply in order)
        A. "Cashback" / "Cash Back" is a card-side withdrawal, NOT a cash tender. Treat as
           "unknown" so it doesn't double-count.
        B. If the line clearly contains "total", "sub-total", "subtotal", "grand total",
           "balance", "change", "amount due" or "rounding", it is "summary", even if other words
           appear too. Summaries always win.
        C. "No Sale" -> "expense" (records a till open). "No ID / No Sale" (refusal log) is NOT a
           till line — treat as "unknown".
        D. Lottery / scratchcard:
             "...Sales" / "...Sold" -> "sale"
             "...Prize Paid" / "...Payout" / "...Cash-out" -> "payout"
        E. Manager / Staff "Discount" -> "discount" (reduces sale).
           Manager / Staff "Refund" -> "refund" (returns money).
        F. "Paid In" / "Float In" / "Float Top-up" -> "payout" (cash MOVEMENT, not a sale).
        G. Tender lines never double as sales. Prefer "tender" only when the line explicitly names
           a payment method.

        INPUT: a JSON array of { id, description }. Amounts are deliberately omitted; some
        descriptions may be lightly redacted with "#" or "[redacted]".

        OUTPUT (STRICT JSON, NOTHING ELSE):
        {
          "results": [
            {
              "id": <number>,
              "category": "sale" | "discount" | "refund" | "payout" | "expense" | "tender" |
                          "summary" | "unknown",
              "tender_kind": "cash" | "card" | "credit_card" | "debit_card" | "fuel_card" |
                             "mobile" | "voucher" | "cheque" | "account" | "other" | null,
              "sale_kind":   "fuel" | "lottery" | "scratchcard" | "paypoint" | "tobacco" |
                             "alcohol" | "grocery" | "hot_food" | "newspaper" | "other" | null
            }
          ]
        }

        Rules for the sub-fields:
        - "tender_kind" MUST be non-null when "category" is "tender", and MUST be null for every
          other category.
        - "sale_kind" MUST be null unless "category" is "sale".
        - Never include extra prose, never wrap the JSON in markdown.
        """;

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

    public async Task<IReadOnlyDictionary<int, TillLineAiDecision>> ClassifyAsync(
        IReadOnlyCollection<TillLineDescriptor> items,
        CancellationToken cancellationToken = default)
    {
        var empty = new Dictionary<int, TillLineAiDecision>();
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
                new { role = "system", content = SystemPrompt },
                new
                {
                    role = "user",
                    content =
                        "Classify the following till-report lines per the rules above. Reply with " +
                        "strict JSON matching the documented schema. Use \"unknown\" only when you " +
                        "truly cannot tell.\n\nLINES:\n" + linesJson
                }
            }
        };
    }

    private static string Redact(string description)
    {
        var value = description ?? string.Empty;
        value = EmailRegex.Replace(value, "[redacted]");
        value = LongDigitsRegex.Replace(value, "#");
        // Strip standalone digits and "x"/"@"/"qty" markers so the same product reads the same
        // regardless of quantity (e.g. "Unleaded 5" and "Unleaded 12" both become "Unleaded").
        return TillDescriptionNormalizer.Normalize(value);
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

    private static Dictionary<int, TillLineAiDecision> ParseResults(string json)
    {
        var map = new Dictionary<int, TillLineAiDecision>();
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

            var categoryRaw = item.TryGetProperty("category", out var categoryElement) ? categoryElement.GetString() : null;
            var category = ParseCategory(categoryRaw);
            if (category is null)
            {
                continue;
            }

            string? tenderKind = null;
            if (category == TillLineAiCategory.Tender
                && item.TryGetProperty("tender_kind", out var tenderElement)
                && tenderElement.ValueKind == JsonValueKind.String)
            {
                tenderKind = tenderElement.GetString();
            }

            string? saleKind = null;
            if (category == TillLineAiCategory.Sale
                && item.TryGetProperty("sale_kind", out var saleElement)
                && saleElement.ValueKind == JsonValueKind.String)
            {
                saleKind = saleElement.GetString();
            }

            map[id] = new TillLineAiDecision(category.Value, tenderKind, saleKind);
        }

        return map;
    }

    private static TillLineAiCategory? ParseCategory(string? raw)
        => raw?.Trim().ToLowerInvariant() switch
        {
            "sale" => TillLineAiCategory.Sale,
            "discount" => TillLineAiCategory.Discount,
            "refund" => TillLineAiCategory.Refund,
            "payout" => TillLineAiCategory.Payout,
            "expense" => TillLineAiCategory.Expense,
            "tender" => TillLineAiCategory.Tender,
            "summary" => TillLineAiCategory.Summary,
            "unknown" => TillLineAiCategory.Unknown,
            _ => (TillLineAiCategory?)null
        };

    private string ResolveApiKey()
    {
        if (!string.IsNullOrWhiteSpace(_options.ApiKey))
        {
            return _options.ApiKey.Trim();
        }

        return Environment.GetEnvironmentVariable("OPENAI_API_KEY")?.Trim() ?? string.Empty;
    }
}
