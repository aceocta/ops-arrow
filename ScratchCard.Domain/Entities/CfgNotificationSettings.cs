namespace ScratchCard.Domain.Entities;

public class CfgNotificationSettings : CfgSettingsBase
{
    public string? NotificationChannels { get; set; }
    public string? ManualEntryNotificationRecipients { get; set; }
    public string? CashDifferenceNotificationRecipients { get; set; }
    public string? HighPrizePayoutNotificationRecipients { get; set; }
    public bool? SendNotificationOnShiftFinalize { get; set; }
}
