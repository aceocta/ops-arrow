using System.Globalization;

namespace ScratchCard.Application.Services;

internal static class ShiftMetadata
{
    private const string AutoShiftPrefix = "[AUTO_SHIFT]";
    private const string TemplateMarker = "template=";
    private const string WindowMarker = "window=";

    public static string BuildAutoCreatedNote(string templateId, TimeSpan startTime, TimeSpan endTime)
    {
        var safeTemplateId = string.IsNullOrWhiteSpace(templateId) ? "shift" : templateId.Trim();
        return $"{AutoShiftPrefix} template={safeTemplateId};window={startTime:hh\\:mm}-{endTime:hh\\:mm}";
    }

    public static bool IsAutoCreated(string? notes)
    {
        return TryGetAutoTemplateId(notes, out _);
    }

    public static bool TryGetAutoTemplateId(string? notes, out string templateId)
    {
        templateId = string.Empty;
        if (string.IsNullOrWhiteSpace(notes))
        {
            return false;
        }

        var trimmed = notes.Trim();
        if (!trimmed.StartsWith(AutoShiftPrefix, StringComparison.Ordinal))
        {
            return false;
        }

        var markerIndex = trimmed.IndexOf(TemplateMarker, StringComparison.OrdinalIgnoreCase);
        if (markerIndex < 0)
        {
            return true;
        }

        var valueStart = markerIndex + TemplateMarker.Length;
        var valueEnd = trimmed.IndexOf(';', valueStart);
        if (valueEnd < 0)
        {
            valueEnd = trimmed.Length;
        }

        templateId = trimmed[valueStart..valueEnd].Trim();
        return true;
    }

    public static bool TryGetAutoWindow(string? notes, out TimeSpan startTime, out TimeSpan endTime)
    {
        startTime = default;
        endTime = default;

        if (string.IsNullOrWhiteSpace(notes))
        {
            return false;
        }

        var trimmed = notes.Trim();
        if (!trimmed.StartsWith(AutoShiftPrefix, StringComparison.Ordinal))
        {
            return false;
        }

        var markerIndex = trimmed.IndexOf(WindowMarker, StringComparison.OrdinalIgnoreCase);
        if (markerIndex < 0)
        {
            return false;
        }

        var valueStart = markerIndex + WindowMarker.Length;
        var valueEnd = trimmed.IndexOf(';', valueStart);
        if (valueEnd < 0)
        {
            valueEnd = trimmed.Length;
        }

        var windowValue = trimmed[valueStart..valueEnd].Trim();
        var separatorIndex = windowValue.IndexOf('-', StringComparison.Ordinal);
        if (separatorIndex <= 0 || separatorIndex >= windowValue.Length - 1)
        {
            return false;
        }

        var startText = windowValue[..separatorIndex].Trim();
        var endText = windowValue[(separatorIndex + 1)..].Trim();
        if (!TimeSpan.TryParseExact(startText, @"hh\:mm", CultureInfo.InvariantCulture, out startTime))
        {
            return false;
        }

        if (!TimeSpan.TryParseExact(endText, @"hh\:mm", CultureInfo.InvariantCulture, out endTime))
        {
            return false;
        }

        return true;
    }
}
