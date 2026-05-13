namespace ScratchCard.Domain.Entities;

public class CfgPackSettings : CfgSettingsBase
{
    public string? DefaultSellingOrder { get; set; }
    public string? PackSellingOrder { get; set; }
    public int? ScratchCardDisplayCount { get; set; }
    public bool? AllowLeadingZeros { get; set; }
    public bool? PreventDuplicatePackNumbers { get; set; }
    public bool? RequirePackActivationBeforeSale { get; set; }
    public bool? AllowMultipleActivePacksForSameGame { get; set; }
    public bool? AutoCompletePackWhenFinalSerialReached { get; set; }
    public bool? AllowPackPause { get; set; }
    public bool? AllowPackReturn { get; set; }
    public bool? AllowIssueMarking { get; set; }
}
