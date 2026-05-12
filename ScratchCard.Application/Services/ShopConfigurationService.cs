using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Models;
using ScratchCard.Application.Common.Services;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Entities;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.Services;

public class ShopConfigurationService : IShopConfigurationService
{
    private static readonly JsonSerializerOptions ShiftTemplateJsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    private readonly IRepository<AppConfiguration> _configurationRepository;

    public ShopConfigurationService(IRepository<AppConfiguration> configurationRepository)
    {
        _configurationRepository = configurationRepository;
    }

    public async Task<ShopShiftSetup> GetShiftSetupAsync(Guid shopId, CancellationToken cancellationToken = default)
    {
        var values = await GetEffectiveValuesAsync(shopId, new[]
        {
            ConfigurationKeys.TimeZone,
            ConfigurationKeys.ShiftStartTime,
            ConfigurationKeys.ShiftEndTime,
            ConfigurationKeys.ShiftDefaultName,
            ConfigurationKeys.ShiftTemplates,
            ConfigurationKeys.EnforceShiftTimeWindow,
            ConfigurationKeys.AllowCustomShiftName
        }, cancellationToken);

        var fallbackStartTime = ParseTime(values, ConfigurationKeys.ShiftStartTime, new TimeSpan(6, 0, 0));
        var fallbackEndTime = ParseTime(values, ConfigurationKeys.ShiftEndTime, new TimeSpan(23, 0, 0));
        var fallbackDefaultShiftName = values.TryGetValue(ConfigurationKeys.ShiftDefaultName, out var shiftName) && !string.IsNullOrWhiteSpace(shiftName)
            ? shiftName.Trim()
            : "Main Shift";
        var templates = ParseShiftTemplates(values, fallbackDefaultShiftName, fallbackStartTime, fallbackEndTime);
        var firstTemplate = templates.First();

        return new ShopShiftSetup
        {
            TimeZoneId = values.TryGetValue(ConfigurationKeys.TimeZone, out var timeZone) && !string.IsNullOrWhiteSpace(timeZone)
                ? timeZone.Trim()
                : "UTC",
            ShiftStartTime = firstTemplate.StartTime,
            ShiftEndTime = firstTemplate.EndTime,
            DefaultShiftName = firstTemplate.Name,
            EnforceShiftTimeWindow = ParseBool(values, ConfigurationKeys.EnforceShiftTimeWindow, false),
            AllowCustomShiftName = ParseBool(values, ConfigurationKeys.AllowCustomShiftName, true),
            ShiftTemplates = templates
        };
    }

    public async Task<ShopPackSetup> GetPackSetupAsync(Guid shopId, CancellationToken cancellationToken = default)
    {
        var values = await GetEffectiveValuesAsync(shopId, new[]
        {
            ConfigurationKeys.PackSellingOrder
        }, cancellationToken);

        return new ShopPackSetup
        {
            SellingOrder = ParseSellingOrder(values, ConfigurationKeys.PackSellingOrder)
        };
    }

    private async Task<Dictionary<string, string>> GetEffectiveValuesAsync(
        Guid shopId,
        IReadOnlyCollection<string> keys,
        CancellationToken cancellationToken)
    {
        var normalizedKeys = keys
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        if (normalizedKeys.Length == 0)
        {
            return new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        }

        var rows = await _configurationRepository.Query()
            .AsNoTracking()
            .Where(x =>
                x.IsActive &&
                normalizedKeys.Contains(x.ConfigKey) &&
                (x.ShopId == null || x.ShopId == shopId))
            .OrderByDescending(x => x.ShopId.HasValue)
            .ThenByDescending(x => x.CreatedOn)
            .ToListAsync(cancellationToken);

        var values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var row in rows)
        {
            if (!values.ContainsKey(row.ConfigKey))
            {
                values[row.ConfigKey] = row.ConfigValue;
            }
        }

        return values;
    }

    private static bool ParseBool(IReadOnlyDictionary<string, string> values, string key, bool fallback)
    {
        if (!values.TryGetValue(key, out var value) || string.IsNullOrWhiteSpace(value))
        {
            return fallback;
        }

        if (bool.TryParse(value, out var parsed))
        {
            return parsed;
        }

        return value.Trim() switch
        {
            "1" => true,
            "0" => false,
            _ => fallback
        };
    }

    private static IReadOnlyCollection<ShopShiftTemplate> ParseShiftTemplates(
        IReadOnlyDictionary<string, string> values,
        string fallbackDefaultShiftName,
        TimeSpan fallbackStartTime,
        TimeSpan fallbackEndTime)
    {
        if (!values.TryGetValue(ConfigurationKeys.ShiftTemplates, out var raw) || string.IsNullOrWhiteSpace(raw))
        {
            return BuildFallbackTemplates(fallbackDefaultShiftName, fallbackStartTime, fallbackEndTime);
        }

        var payloadTemplates = TryParseTemplatePayloads(raw);
        if (payloadTemplates.Count == 0)
        {
            return BuildFallbackTemplates(fallbackDefaultShiftName, fallbackStartTime, fallbackEndTime);
        }

        var templates = new List<ShopShiftTemplate>(payloadTemplates.Count);
        var usedIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var usedNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var payload in payloadTemplates)
        {
            var name = (payload.Name ?? payload.ShiftName ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(name))
            {
                continue;
            }

            if (!TryParseTime(payload.StartTime, out var startTime) || !TryParseTime(payload.EndTime, out var endTime))
            {
                continue;
            }

            var baseName = name.Length > 100 ? name[..100].TrimEnd() : name;
            var uniqueName = baseName;
            var sequence = 2;
            while (!usedNames.Add(uniqueName))
            {
                var suffix = $" {sequence}";
                var allowedLength = Math.Max(1, 100 - suffix.Length);
                uniqueName = $"{baseName[..Math.Min(baseName.Length, allowedLength)].TrimEnd()}{suffix}";
                sequence++;
            }

            var requestedId = (payload.TemplateId ?? payload.Id ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(requestedId))
            {
                requestedId = BuildTemplateId(uniqueName);
            }

            var uniqueId = requestedId;
            var idSequence = 2;
            while (!usedIds.Add(uniqueId))
            {
                uniqueId = $"{requestedId}-{idSequence}";
                idSequence++;
            }

            templates.Add(new ShopShiftTemplate
            {
                TemplateId = uniqueId.Length > 80 ? uniqueId[..80].TrimEnd('-') : uniqueId,
                Name = uniqueName,
                StartTime = startTime,
                EndTime = endTime,
                IsActive = payload.IsActive ?? true
            });
        }

        if (templates.Count == 0)
        {
            return BuildFallbackTemplates(fallbackDefaultShiftName, fallbackStartTime, fallbackEndTime);
        }

        return templates
            .OrderBy(x => x.StartTime)
            .ThenBy(x => x.Name, StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    private static IReadOnlyList<ShiftTemplatePayload> TryParseTemplatePayloads(string raw)
    {
        var trimmed = raw.Trim();
        if (string.IsNullOrWhiteSpace(trimmed))
        {
            return Array.Empty<ShiftTemplatePayload>();
        }

        try
        {
            if (trimmed.StartsWith("[", StringComparison.Ordinal))
            {
                return JsonSerializer.Deserialize<List<ShiftTemplatePayload>>(trimmed, ShiftTemplateJsonOptions)
                    ?? new List<ShiftTemplatePayload>();
            }

            using var document = JsonDocument.Parse(trimmed);
            if (document.RootElement.ValueKind != JsonValueKind.Object ||
                !document.RootElement.TryGetProperty("templates", out var templatesNode) ||
                templatesNode.ValueKind != JsonValueKind.Array)
            {
                return Array.Empty<ShiftTemplatePayload>();
            }

            return JsonSerializer.Deserialize<List<ShiftTemplatePayload>>(templatesNode.GetRawText(), ShiftTemplateJsonOptions)
                ?? new List<ShiftTemplatePayload>();
        }
        catch
        {
            return Array.Empty<ShiftTemplatePayload>();
        }
    }

    private static IReadOnlyCollection<ShopShiftTemplate> BuildFallbackTemplates(
        string fallbackDefaultShiftName,
        TimeSpan fallbackStartTime,
        TimeSpan fallbackEndTime)
    {
        var normalizedName = string.IsNullOrWhiteSpace(fallbackDefaultShiftName)
            ? "Main Shift"
            : fallbackDefaultShiftName.Trim();

        return new[]
        {
            new ShopShiftTemplate
            {
                TemplateId = BuildTemplateId(normalizedName),
                Name = normalizedName,
                StartTime = fallbackStartTime,
                EndTime = fallbackEndTime,
                IsActive = true
            }
        };
    }

    private static string BuildTemplateId(string name)
    {
        var chars = name
            .ToLowerInvariant()
            .Select(ch => char.IsLetterOrDigit(ch) ? ch : '-')
            .ToArray();

        var compact = new string(chars)
            .Trim('-');

        while (compact.Contains("--", StringComparison.Ordinal))
        {
            compact = compact.Replace("--", "-", StringComparison.Ordinal);
        }

        if (string.IsNullOrWhiteSpace(compact))
        {
            compact = "shift";
        }

        return compact.Length > 80 ? compact[..80].TrimEnd('-') : compact;
    }

    private static TimeSpan ParseTime(IReadOnlyDictionary<string, string> values, string key, TimeSpan fallback)
    {
        if (!values.TryGetValue(key, out var raw) || string.IsNullOrWhiteSpace(raw))
        {
            return fallback;
        }

        if (TryParseTime(raw, out var parsed))
        {
            return parsed;
        }

        return fallback;
    }

    private static bool TryParseTime(string? raw, out TimeSpan value)
    {
        value = default;
        if (string.IsNullOrWhiteSpace(raw))
        {
            return false;
        }

        var input = raw.Trim();

        if (TimeSpan.TryParseExact(input, @"hh\:mm", CultureInfo.InvariantCulture, out var hhmm))
        {
            value = hhmm;
            return true;
        }

        if (TimeSpan.TryParse(input, CultureInfo.InvariantCulture, out var parsedTimeSpan))
        {
            value = parsedTimeSpan;
            return true;
        }

        if (TimeOnly.TryParse(input, CultureInfo.InvariantCulture, DateTimeStyles.AllowWhiteSpaces, out var timeOnly))
        {
            value = timeOnly.ToTimeSpan();
            return true;
        }

        return false;
    }

    private static SellingOrder ParseSellingOrder(IReadOnlyDictionary<string, string> values, string key)
    {
        if (!values.TryGetValue(key, out var raw) || string.IsNullOrWhiteSpace(raw))
        {
            return SellingOrder.Ascending;
        }

        if (Enum.TryParse<SellingOrder>(raw.Trim(), true, out var parsedEnum) && parsedEnum is SellingOrder.Ascending or SellingOrder.Descending)
        {
            return parsedEnum;
        }

        if (int.TryParse(raw.Trim(), out var parsedInt))
        {
            return parsedInt == (int)SellingOrder.Descending ? SellingOrder.Descending : SellingOrder.Ascending;
        }

        var normalized = raw.Trim();
        if (normalized.Equals("end_to_0", StringComparison.OrdinalIgnoreCase) ||
            normalized.Equals("end-to-0", StringComparison.OrdinalIgnoreCase) ||
            normalized.Equals("endto0", StringComparison.OrdinalIgnoreCase) ||
            normalized.Equals("descending", StringComparison.OrdinalIgnoreCase))
        {
            return SellingOrder.Descending;
        }

        return SellingOrder.Ascending;
    }

    private sealed class ShiftTemplatePayload
    {
        [JsonPropertyName("id")]
        public string? Id { get; set; }

        [JsonPropertyName("templateId")]
        public string? TemplateId { get; set; }

        [JsonPropertyName("name")]
        public string? Name { get; set; }

        [JsonPropertyName("shiftName")]
        public string? ShiftName { get; set; }

        [JsonPropertyName("startTime")]
        public string? StartTime { get; set; }

        [JsonPropertyName("endTime")]
        public string? EndTime { get; set; }

        [JsonPropertyName("isActive")]
        public bool? IsActive { get; set; }
    }
}
