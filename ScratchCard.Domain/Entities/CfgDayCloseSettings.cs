namespace ScratchCard.Domain.Entities;

public class CfgDayCloseSettings : CfgSettingsBase
{
    public bool? RequireDayEndClose { get; set; }
    public bool? AllowDayReopen { get; set; }
    public string? WhoCanReopenDay { get; set; }
    public bool? RequireAllShiftsClosedBeforeDayClose { get; set; }
    public bool? RequireNoteWhenDayDifferenceExists { get; set; }
}
