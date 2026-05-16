namespace ScratchCard.Domain.Entities;

public class CfgGeneralSettings : CfgSettingsBase
{
    public string? Currency { get; set; }
    public string? TimeZone { get; set; }
    public string? BusinessStartTime { get; set; }
    public string? BusinessEndTime { get; set; }
    public string? BusinessDateCutOffTime { get; set; }
    public bool? EnableAuditLog { get; set; }
}
