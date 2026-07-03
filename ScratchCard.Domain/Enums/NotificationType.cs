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
    TemperatureMissedLog = 10,
    VisitorInspectorArrival = 11,
    TemperatureLogReminder = 12,
    ComplianceActionRaised = 13,
    ShiftManualEntrySubmitted = 14,
    ShiftReminder = 15,
    WeeklyTimesheet = 16,
    ShiftSwapRequested = 17,
    ShiftSwapCompleted = 18,
    ShiftSwapDeclined = 19,
    TimesheetReviewRequested = 20,
    TimesheetIssueRaised = 21,
    TimesheetReviewResolved = 22,
    TimesheetAllConfirmed = 23,
    TimesheetApproved = 24,
    LeaveRequested = 25,
    LeaveDecided = 26,
    TemperaturePredictiveAlert = 27,
    CoinLowStockAlert = 28,
    CoinOutOfStockAlert = 29,
    // Hot & Cold food-safety alerts (spec §18/§19).
    TemperatureExcursionAlert = 30,      // a Warning/Fail reading (Fail = urgent)
    TemperatureEquipmentNotWorking = 31, // a unit marked / detected not working (urgent)
    TemperatureTimerNearLimit = 32,      // §16 dwell timer approaching the 2h/4h limit (high)
    TemperatureTimerLimitReached = 33,   // §16 dwell timer at/over the limit (critical)
    TemperatureIssueEscalated = 34,      // issue unresolved far past the limit (escalation)
    TemperatureIssueResolved = 35        // issue resolved / unit back in service (normal)
}
