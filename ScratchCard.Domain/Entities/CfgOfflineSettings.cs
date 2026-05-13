namespace ScratchCard.Domain.Entities;

public class CfgOfflineSettings : CfgSettingsBase
{
    public bool? EnableOfflineShiftClose { get; set; }
    public bool? AllowOfflinePrizePayout { get; set; }
    public bool? AllowOfflineShiftReconciliation { get; set; }
    public bool? AutoSyncWhenOnline { get; set; }
    public bool? ConflictRequiresManagerReview { get; set; }
}
