namespace ScratchCard.Domain.Entities;

public class CfgShiftSettings : CfgSettingsBase
{
    public bool? RequireShiftClose { get; set; }
    public bool? AllowShiftReopen { get; set; }
    public string? WhoCanReopenShift { get; set; }
    public string? ShiftStartTime { get; set; }
    public string? ShiftEndTime { get; set; }
    public string? ShiftDefaultName { get; set; }
    public string? ShiftTemplates { get; set; }
    public bool? EnforceShiftTimeWindow { get; set; }
    public bool? AllowCustomShiftName { get; set; }
    public bool? RequireReasonForManualClosingSerial { get; set; }
    public bool? NotifyOnManualClosingSerialEntry { get; set; }
    public bool? NotifyOnScannedSerialEdit { get; set; }
    // Minutes before a rota shift's start that assigned staff get a push reminder (default 120 = 2h).
    public int? RotaReminderLeadMinutes { get; set; }
}
