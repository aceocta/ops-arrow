using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Models;
using ScratchCard.Application.Common.Services;
using ScratchCard.Domain.Entities;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.Services;

public class ShopConfigurationService : IShopConfigurationService
{
    private static readonly JsonSerializerOptions ShiftTemplateJsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    private readonly IRepository<CfgGeneralSettings> _generalRepository;
    private readonly IRepository<CfgShiftSettings> _shiftRepository;
    private readonly IRepository<CfgPackSettings> _packRepository;

    public ShopConfigurationService(
        IRepository<CfgGeneralSettings> generalRepository,
        IRepository<CfgShiftSettings> shiftRepository,
        IRepository<CfgPackSettings> packRepository)
    {
        _generalRepository = generalRepository;
        _shiftRepository = shiftRepository;
        _packRepository = packRepository;
    }

    public async Task<ShopShiftSetup> GetShiftSetupAsync(Guid shopId, CancellationToken cancellationToken = default)
    {
        var (globalGeneral, shopGeneral) = await LoadRowsAsync(_generalRepository, shopId, cancellationToken);
        var (globalShift, shopShift) = await LoadRowsAsync(_shiftRepository, shopId, cancellationToken);

        var fallbackStartTime = ParseTime(Resolve(shopShift?.ShiftStartTime, globalShift?.ShiftStartTime, "06:00"), new TimeSpan(6, 0, 0));
        var fallbackEndTime = ParseTime(Resolve(shopShift?.ShiftEndTime, globalShift?.ShiftEndTime, "23:00"), new TimeSpan(23, 0, 0));
        var fallbackDefaultShiftName = Resolve(shopShift?.ShiftDefaultName, globalShift?.ShiftDefaultName, "Main Shift");
        var templates = ParseShiftTemplates(
            Resolve(shopShift?.ShiftTemplates, globalShift?.ShiftTemplates, string.Empty),
            fallbackDefaultShiftName,
            fallbackStartTime,
            fallbackEndTime);
        var firstTemplate = templates.First();

        return new ShopShiftSetup
        {
            TimeZoneId = Resolve(shopGeneral?.TimeZone, globalGeneral?.TimeZone, "UTC"),
            ShiftStartTime = firstTemplate.StartTime,
            ShiftEndTime = firstTemplate.EndTime,
            DefaultShiftName = firstTemplate.Name,
            EnforceShiftTimeWindow = Resolve(shopShift?.EnforceShiftTimeWindow, globalShift?.EnforceShiftTimeWindow, false),
            AllowCustomShiftName = Resolve(shopShift?.AllowCustomShiftName, globalShift?.AllowCustomShiftName, true),
            ShiftTemplates = templates
        };
    }

    public async Task<ShopBusinessDaySetup> GetBusinessDaySetupAsync(Guid shopId, CancellationToken cancellationToken = default)
    {
        var (globalGeneral, shopGeneral) = await LoadRowsAsync(_generalRepository, shopId, cancellationToken);
        var (globalShift, shopShift) = await LoadRowsAsync(_shiftRepository, shopId, cancellationToken);

        var fallbackStart = Resolve(shopShift?.ShiftStartTime, globalShift?.ShiftStartTime, "06:00");
        var fallbackEnd = Resolve(
            shopGeneral?.BusinessDateCutOffTime,
            globalGeneral?.BusinessDateCutOffTime,
            Resolve(shopShift?.ShiftEndTime, globalShift?.ShiftEndTime, "21:59"));

        return new ShopBusinessDaySetup
        {
            TimeZoneId = Resolve(shopGeneral?.TimeZone, globalGeneral?.TimeZone, "UTC"),
            BusinessStartTime = ParseTime(
                Resolve(shopGeneral?.BusinessStartTime, globalGeneral?.BusinessStartTime, fallbackStart),
                new TimeSpan(6, 0, 0)),
            BusinessEndTime = ParseTime(
                Resolve(shopGeneral?.BusinessEndTime, globalGeneral?.BusinessEndTime, fallbackEnd),
                new TimeSpan(21, 59, 0))
        };
    }

    public async Task<ShopPackSetup> GetPackSetupAsync(Guid shopId, CancellationToken cancellationToken = default)
    {
        var (globalPack, shopPack) = await LoadRowsAsync(_packRepository, shopId, cancellationToken);
        var displayCount = Resolve(shopPack?.ScratchCardDisplayCount, globalPack?.ScratchCardDisplayCount, 24);
        if (displayCount <= 0)
        {
            displayCount = 24;
        }

        return new ShopPackSetup
        {
            SellingOrder = ParseSellingOrder(Resolve(shopPack?.PackSellingOrder, globalPack?.PackSellingOrder, "Ascending")),
            DisplayCount = displayCount
        };
    }

    private static async Task<(TEntity? Global, TEntity? Shop)> LoadRowsAsync<TEntity>(
        IRepository<TEntity> repository,
        Guid shopId,
        CancellationToken cancellationToken)
        where TEntity : CfgSettingsBase
    {
        var rows = await repository.Query()
            .AsNoTracking()
            .Where(x =>
                x.IsActive &&
                (x.ShopId == null || x.ShopId == shopId))
            .ToListAsync(cancellationToken);

        var global = rows
            .Where(x => x.ShopId == null)
            .OrderByDescending(x => x.ModifiedOn ?? x.CreatedOn)
            .FirstOrDefault();

        var shop = rows
            .Where(x => x.ShopId == shopId)
            .OrderByDescending(x => x.ModifiedOn ?? x.CreatedOn)
            .FirstOrDefault();

        return (global, shop);
    }

    private static IReadOnlyCollection<ShopShiftTemplate> ParseShiftTemplates(
        string raw,
        string fallbackDefaultShiftName,
        TimeSpan fallbackStartTime,
        TimeSpan fallbackEndTime)
    {
        if (string.IsNullOrWhiteSpace(raw))
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

    private static TimeSpan ParseTime(string? raw, TimeSpan fallback)
    {
        return TryParseTime(raw, out var parsed) ? parsed : fallback;
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

    private static SellingOrder ParseSellingOrder(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
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

    private static string Resolve(string? shopValue, string? globalValue, string fallback)
    {
        var selected = shopValue ?? globalValue;
        return string.IsNullOrWhiteSpace(selected) ? fallback : selected.Trim();
    }

    private static T Resolve<T>(T? shopValue, T? globalValue, T fallback) where T : struct
    {
        return shopValue ?? globalValue ?? fallback;
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
