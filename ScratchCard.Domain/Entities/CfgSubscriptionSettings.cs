namespace ScratchCard.Domain.Entities;

public class CfgSubscriptionSettings : CfgSettingsBase
{
    public int? DefaultTrialDays { get; set; }
    public int? TrialEndingReminderDays { get; set; }
    public int? PaymentGracePeriodDays { get; set; }
    public bool? BulkDiscountEnabled { get; set; }
}
