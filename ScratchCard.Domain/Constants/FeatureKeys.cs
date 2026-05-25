namespace ScratchCard.Domain.Constants;

public static class FeatureKeys
{
    // --- Legacy top-level modules (kept for backwards readability) ---
    public const string ScratchCardManagement = "ScratchCardManagement";
    public const string TemperatureLog = "TemperatureLog";
    public const string RefusalNoIdNoSale = "RefusalNoIdNoSale";
    public const string ComplianceChecklist = "ComplianceChecklist";
    public const string SafeDropManagement = "SafeDropManagement";

    // --- Scratch Card Management ---
    public const string ScratchCardBasic = "scratch_card.basic";
    public const string ScratchCardAttachments = "scratch_card.attachments";
    public const string ScratchCardManualEntryAlerts = "scratch_card.manual_entry_alerts";
    public const string ScratchCardAdvancedValidation = "scratch_card.advanced_validation";
    public const string ScratchCardManualCorrectionReasons = "scratch_card.manual_correction_reasons";
    public const string ScratchCardSuspiciousAlerts = "scratch_card.suspicious_alerts";

    // --- Temperature Log ---
    public const string TemperatureLogBasic = "temperature_log.basic";
    public const string TemperatureLogMissedAlerts = "temperature_log.missed_alerts";
    public const string TemperatureLogScheduledChecks = "temperature_log.scheduled_checks";
    public const string TemperatureLogFullHistory = "temperature_log.full_history";

    // --- Refusal Log ---
    public const string RefusalLogBasic = "refusal_log.basic";
    public const string RefusalLogAttachments = "refusal_log.attachments";
    public const string RefusalLogMultiManagerReview = "refusal_log.multi_manager_review";
    public const string RefusalLogAnalytics = "refusal_log.analytics";
    public const string RefusalLogStaffReports = "refusal_log.staff_reports";

    // --- Compliance Check ---
    public const string ComplianceBasic = "compliance.basic";
    public const string ComplianceDailyWeeklyMonthly = "compliance.daily_weekly_monthly";
    public const string ComplianceAdvanced = "compliance.advanced";
    public const string CompliancePhotoEvidence = "compliance.photo_evidence";

    // --- Safe Drop ---
    public const string SafeDropBasic = "safe_drop.basic";
    public const string SafeDropCanisterLimitAlerts = "safe_drop.canister_limit_alerts";
    public const string SafeDropAdvanced = "safe_drop.advanced";
    public const string SafeDropApprovalWorkflow = "safe_drop.approval_workflow";
    public const string SafeDropCashVariance = "safe_drop.cash_variance";

    // --- Notifications ---
    public const string NotificationsEmail = "notifications.email";
    public const string NotificationsPush = "notifications.push";
    public const string NotificationsWhatsApp = "notifications.whatsapp";
    public const string NotificationsPriority = "notifications.priority";

    // --- Dashboard ---
    public const string DashboardBasic = "dashboard.basic";
    public const string DashboardAdvanced = "dashboard.advanced";
    public const string DashboardMultiShop = "dashboard.multi_shop";

    // --- Audit / Reports / Approvals ---
    public const string AuditLogBasic = "audit_log.basic";
    public const string ApprovalWorkflow = "approval_workflow.manager";
    public const string ReportsAdvanced = "reports.advanced";
    public const string SupportPriority = "support.priority";
}
