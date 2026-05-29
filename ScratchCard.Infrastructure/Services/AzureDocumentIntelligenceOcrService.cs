using System.Globalization;
using System.Text.RegularExpressions;
using Azure;
using Azure.AI.DocumentIntelligence;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Helpers;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Models;
using ScratchCard.Domain.Constants;

namespace ScratchCard.Infrastructure.Services;

public class AzureDocumentIntelligenceOcrService : ITillReportOcrService
{
    // A monetary token: requires a decimal point so we don't mistake item counts for amounts.
    // Allows optional currency symbol, thousands separators, leading minus, and (negatives).
    private static readonly Regex MoneyRegex = new(
        @"\(?-?\s?[£$€]?\s?(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{1,2}\)?",
        RegexOptions.Compiled);

    private readonly DocumentIntelligenceOptions _options;
    private readonly ILogger<AzureDocumentIntelligenceOcrService> _logger;

    public AzureDocumentIntelligenceOcrService(
        IOptions<DocumentIntelligenceOptions> options,
        ILogger<AzureDocumentIntelligenceOcrService> logger)
    {
        _options = options.Value;
        _logger = logger;
    }

    public async Task<TillOcrResult> ExtractAsync(
        byte[] content,
        string contentType,
        string fileName,
        CancellationToken cancellationToken = default)
    {
        if (content is null || content.Length == 0)
        {
            throw new AppException(ErrorCodes.TillReportImageRequired, "A till report file is required.");
        }

        if (string.IsNullOrWhiteSpace(_options.Endpoint) || string.IsNullOrWhiteSpace(_options.ApiKey))
        {
            throw new AppException(
                ErrorCodes.TillReportOcrNotConfigured,
                "Document Intelligence is not configured. Set DocumentIntelligence:Endpoint and DocumentIntelligence:ApiKey.",
                500);
        }

        var modelId = string.IsNullOrWhiteSpace(_options.ModelId) ? "prebuilt-layout" : _options.ModelId.Trim();

        AnalyzeResult analysis;
        try
        {
            var client = new DocumentIntelligenceClient(new Uri(_options.Endpoint.Trim()), new AzureKeyCredential(_options.ApiKey.Trim()));
            Operation<AnalyzeResult> operation = await client.AnalyzeDocumentAsync(
                WaitUntil.Completed,
                modelId,
                BinaryData.FromBytes(content),
                cancellationToken: cancellationToken);
            analysis = operation.Value;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Document Intelligence analysis failed for {FileName}.", fileName);
            throw new AppException(ErrorCodes.TillReportOcrFailed, "Unable to read the till report right now. Please try again.", 502);
        }

        var rawText = analysis.Content ?? string.Empty;
        var lines = ExtractLines(analysis);

        return new TillOcrResult
        {
            RawText = rawText,
            Lines = lines
        };
    }

    private static List<TillOcrLine> ExtractLines(AnalyzeResult analysis)
    {
        // Tables give us proper "description column + amount column" rows. Prefer them; the
        // line-based reader is a fallback for reports that didn't come back as a table.
        var fromTables = ExtractFromTables(analysis);
        return fromTables.Count > 0 ? fromTables : ExtractFromLines(analysis);
    }

    private static List<TillOcrLine> ExtractFromTables(AnalyzeResult analysis)
    {
        var results = new List<TillOcrLine>();
        if (analysis.Tables is null)
        {
            return results;
        }

        foreach (var table in analysis.Tables)
        {
            foreach (var row in table.Cells.GroupBy(c => c.RowIndex).OrderBy(g => g.Key))
            {
                var cells = row.OrderBy(c => c.ColumnIndex).ToList();

                decimal? amount = null;
                var amountColumn = -1;
                for (var i = cells.Count - 1; i >= 0; i--)
                {
                    var parsed = TryParseMoneyCell(cells[i].Content);
                    if (parsed.HasValue)
                    {
                        amount = parsed;
                        amountColumn = cells[i].ColumnIndex;
                        break;
                    }
                }

                if (amount is null)
                {
                    continue;
                }

                var description = string.Join(
                    " ",
                    cells
                        .Where(c => c.ColumnIndex != amountColumn)
                        .Select(c => TakeBeforeColon((c.Content ?? string.Empty).Trim()))
                        .Where(s => s.Length > 0 && !TryParseMoneyCell(s).HasValue))
                    .Trim();

                // Descriptions are alphabetic — strip any digit / qty / colon noise before storing.
                description = TillDescriptionNormalizer.Normalize(description);
                if (!HasLetter(description))
                {
                    continue;
                }

                results.Add(new TillOcrLine { Description = description, Amount = amount.Value });
            }
        }

        return Dedupe(results);
    }

    private static List<TillOcrLine> ExtractFromLines(AnalyzeResult analysis)
    {
        var results = new List<TillOcrLine>();
        // Layout often splits the description column and the amount column onto separate lines.
        // Hold the last description-only line so an amount-only line that follows can adopt it.
        string? pendingDescription = null;

        foreach (var page in analysis.Pages)
        {
            foreach (var line in page.Lines)
            {
                var text = (line.Content ?? string.Empty).Trim();
                if (text.Length == 0)
                {
                    continue;
                }

                var (description, amount, hasTrailingAmount) = TryExtractTrailingAmount(text);
                // Descriptions are alphabetic — strip any digit / qty / colon noise here so the
                // pairing logic and storage both see the clean identifier.
                description = TillDescriptionNormalizer.Normalize(description);

                if (!hasTrailingAmount)
                {
                    var cleanText = TillDescriptionNormalizer.Normalize(text);
                    if (HasLetter(cleanText))
                    {
                        pendingDescription = cleanText;
                    }
                    continue;
                }

                if (HasLetter(description))
                {
                    results.Add(new TillOcrLine { Description = description, Amount = amount });
                    pendingDescription = null;
                }
                else if (!string.IsNullOrWhiteSpace(pendingDescription))
                {
                    results.Add(new TillOcrLine { Description = pendingDescription!, Amount = amount });
                    pendingDescription = null;
                }
                // else: an amount with no label anywhere — skip rather than show a blank row.
            }
        }

        return Dedupe(results);
    }

    private static (string Description, decimal Amount, bool HasTrailingAmount) TryExtractTrailingAmount(string text)
    {
        var matches = MoneyRegex.Matches(text);
        if (matches.Count == 0)
        {
            return (text, 0m, false);
        }

        var last = matches[^1];
        // Only treat it as a trailing amount if nothing meaningful follows it.
        var trailing = text[(last.Index + last.Length)..].Trim();
        if (trailing.Length > 0)
        {
            return (text, 0m, false);
        }

        var amount = ParseMoney(last.Value) ?? 0m;
        var description = text[..last.Index].Trim().TrimEnd(':', '-', '£', '$', '€', ' ', '\t').Trim();
        // Till-report convention: the description is whatever sits before the first ':'.
        description = TakeBeforeColon(description);
        return (description, amount, true);
    }

    private static string TakeBeforeColon(string value)
    {
        var i = value.IndexOf(':');
        return i >= 0 ? value[..i].Trim() : value;
    }

    private static decimal? TryParseMoneyCell(string? content)
    {
        var trimmed = (content ?? string.Empty).Trim();
        if (trimmed.Length == 0 || HasLetter(trimmed) || !MoneyRegex.IsMatch(trimmed))
        {
            return null;
        }

        return ParseMoney(trimmed);
    }

    private static decimal? ParseMoney(string token)
    {
        var cleaned = token
            .Replace("£", string.Empty)
            .Replace("$", string.Empty)
            .Replace("€", string.Empty)
            .Replace(",", string.Empty)
            .Replace("(", string.Empty)
            .Replace(")", string.Empty)
            .Replace(" ", string.Empty)
            .TrimStart('-');

        return decimal.TryParse(cleaned, NumberStyles.Number, CultureInfo.InvariantCulture, out var value)
            // Sign is irrelevant — the rules engine decides income vs expense, so store the magnitude.
            ? Math.Abs(value)
            : null;
    }

    private static bool HasLetter(string value) => value.Any(char.IsLetter);

    private static List<TillOcrLine> Dedupe(List<TillOcrLine> lines)
    {
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var result = new List<TillOcrLine>();
        foreach (var line in lines)
        {
            if (seen.Add($"{line.Description}|{line.Amount}"))
            {
                result.Add(line);
            }
        }

        return result;
    }
}
