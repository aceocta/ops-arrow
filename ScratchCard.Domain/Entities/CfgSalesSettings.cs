namespace ScratchCard.Domain.Entities;

public class CfgSalesSettings : CfgSettingsBase
{
    public bool? AllowBackdatedSales { get; set; }
    public int? MaximumBackdateDays { get; set; }
    public bool? AllowFutureDatedSales { get; set; }
    public bool? RequireManagerApprovalForCorrection { get; set; }
}
