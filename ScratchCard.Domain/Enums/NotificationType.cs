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
    LeaveDecided = 26
}
