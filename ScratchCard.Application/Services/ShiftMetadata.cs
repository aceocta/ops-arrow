namespace ScratchCard.Application.Services;

internal static class ShiftMetadata
{
    private const string AutoShiftPrefix = "[AUTO_SHIFT]";
    private const string TemplateMarker = "template=";

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
}
