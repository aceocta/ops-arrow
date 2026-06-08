namespace ScratchCard.Domain.Entities;

public class CfgGeneralSettings : CfgSettingsBase
{
    public string? Currency { get; set; }
    public string? TimeZone { get; set; }
    public string? BusinessStartTime { get; set; }
    public string? BusinessEndTime { get; set; }
    public string? BusinessDateCutOffTime { get; set; }
    public bool? EnableAuditLog { get; set; }
    // When true, the temperature log shows early/late/missed timing status (company-owner only on
    // the client). When false, those indicators are hidden for everyone.
    public bool? ShowTemperatureTimingStatus { get; set; }
    // When true, the temperature log shows the reading time (company-owner only on the client).
    public bool? ShowTemperatureReadingTime { get; set; }
    // When true, the temperature log shows in-range / out-of-range status (company-owner only).
    public bool? ShowTemperatureRangeStatus { get; set; }
}
