using System.Text.RegularExpressions;

namespace ScratchCard.Infrastructure.Services;

/// <summary>
/// Normalises UK and international phone numbers to E.164 *without* the leading +, the format
/// Meta's WhatsApp Cloud API expects in the "to" field of message requests. Examples:
///   "07911 123456"   -> "447911123456"
///   "+44 7911 123456" -> "447911123456"
///   "447911123456"   -> "447911123456"
///   "+34 612 345 678" -> "34612345678"
/// </summary>
internal static class PhoneNumberNormaliser
{
    private const string UkCountryCode = "44";

    public static string? NormaliseE164(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }

        // Strip every non-digit except a leading + we'll re-evaluate.
        var hasLeadingPlus = raw.TrimStart().StartsWith('+');
        var digitsOnly = Regex.Replace(raw, "[^0-9]", string.Empty);

        if (digitsOnly.Length < 7)
        {
            return null;
        }

        // Already international (started with +) — trust the number, strip the plus.
        if (hasLeadingPlus)
        {
            return digitsOnly;
        }

        // UK national starting with 0 -> swap leading 0 for 44.
        if (digitsOnly.StartsWith('0'))
        {
            return UkCountryCode + digitsOnly[1..];
        }

        // 44xxxxxxxxxx — already UK E.164 minus the +.
        if (digitsOnly.StartsWith(UkCountryCode) && digitsOnly.Length >= 11)
        {
            return digitsOnly;
        }

        // Best-effort: treat as already E.164.
        return digitsOnly;
    }
}
