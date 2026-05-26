namespace ScratchCard.Domain.Enums;

public enum NotificationType
{
    ManualClosingSerialEntry = 1,
    ScannedClosingSerialEdited = 2,
    CashDifferenceAlert = 3,
    HighPrizePayoutAlert = 4,
    ShiftCloseSummary = 5,
    DayCloseSummary = 6,
    SafeDropRecorded = 7,
    SuspiciousScratchCardActivity = 8,
    CanisterLimitExceeded = 9,
    TemperatureMissedLog = 10
}
