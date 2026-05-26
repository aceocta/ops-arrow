namespace ScratchCard.Domain.Constants;

public sealed record FeatureCatalogEntry(string Key, string Name, string Category, string? Description = null, int DisplayOrder = 0);

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

    // --- Reserved keys ---
    // These constants are seeded onto plans today (so the admin UI shows them as "Pro features")
    // but the platform does not yet have a concrete enforcement point for them. Adding the gate
    // requires implementing the underlying capability first. Listed here so the next developer
    // knows the key exists and what's expected:
    //
    //   scratch_card.advanced_validation        → server-side serial-range validation beyond
    //                                              basic numeric checks. Add when the validator
    //                                              service has a "strict" mode.
    //   scratch_card.manual_correction_reasons  → required-reason workflow on manual sales
    //                                              corrections (typed reason categories). Add
    //                                              when the manual-correction UI is reworked.
    //   scratch_card.suspicious_alerts          → alerts on suspicious activity patterns (big
    //                                              serial jumps, after-hours sales, etc.). Add
    //                                              when detection logic exists.
    //   temperature_log.missed_alerts           → outbound alerts when a daily/scheduled
    //                                              temperature check is missed. Needs a
    //                                              background sweeper.
    //   temperature_log.scheduled_checks        → admin-configurable schedule for required
    //                                              temperature readings (vs. on-demand). Needs
    //                                              new config + UI.
    //   refusal_log.staff_reports               → staff-grouped slice inside the refusal report.
    //                                              Today the report is flat. Add when the UI
    //                                              splits per-staff.
    //   safe_drop.canister_limit_alerts         → notify managers when a canister exceeds its
    //                                              configured cash limit. Needs limit config.
    //   safe_drop.advanced                      → catch-all for advanced safe-drop workflows.
    //                                              No discrete endpoint yet.
    //   safe_drop.approval_workflow             → manager-approval requirement on safe drops
    //                                              (currently only prize payouts have this).
    //   safe_drop.cash_variance                 → variance calculation between recorded drops
    //                                              and reconciled cash. Needs the variance calc.
    //   dashboard.basic / .advanced / .multi_shop → no dashboard endpoints exist on the API
    //                                              today; these are placeholders for when one
    //                                              is added.
    //   notifications.priority                  → priority queue / higher-frequency dispatch.
    //                                              The current INotificationService treats every
    //                                              message equally.
    //   support.priority                        → UI-only signal in the help screen; nothing
    //                                              for the backend to enforce.

    // Canonical catalogue of all platform-defined features. SeedDataInitializer upserts a
    // Feature row for each entry on startup. Add new entries here when you introduce a new
    // gated capability; the seed step will create the row and existing plans will continue
    // to work (the new feature is simply not yet assigned to any plan).
    public static readonly IReadOnlyList<FeatureCatalogEntry> Catalog = new[]
    {
        // Legacy top-level modules — kept for backwards readability.
        new FeatureCatalogEntry(ScratchCardManagement, "Scratch Card Management", "Modules", "Top-level Scratch Card module.", 1),
        new FeatureCatalogEntry(TemperatureLog, "Temperature Log", "Modules", "Top-level Temperature Log module.", 2),
        new FeatureCatalogEntry(RefusalNoIdNoSale, "Refusal Register", "Modules", "Top-level Refusal / No ID No Sale module.", 3),
        new FeatureCatalogEntry(ComplianceChecklist, "Compliance Checklist", "Modules", "Top-level Compliance module.", 4),
        new FeatureCatalogEntry(SafeDropManagement, "Safe Drop Management", "Modules", "Top-level Safe Drop module.", 5),

        // Scratch Card.
        new FeatureCatalogEntry(ScratchCardBasic, "Basic Scratch Card", "Scratch Card", null, 10),
        new FeatureCatalogEntry(ScratchCardAttachments, "Attachments", "Scratch Card", null, 11),
        new FeatureCatalogEntry(ScratchCardManualEntryAlerts, "Manual-entry alerts", "Scratch Card", null, 12),
        new FeatureCatalogEntry(ScratchCardAdvancedValidation, "Advanced validation", "Scratch Card", null, 13),
        new FeatureCatalogEntry(ScratchCardManualCorrectionReasons, "Manual correction reasons", "Scratch Card", null, 14),
        new FeatureCatalogEntry(ScratchCardSuspiciousAlerts, "Suspicious activity alerts", "Scratch Card", null, 15),

        // Temperature Log.
        new FeatureCatalogEntry(TemperatureLogBasic, "Basic Temperature Log", "Temperature Log", null, 20),
        new FeatureCatalogEntry(TemperatureLogMissedAlerts, "Missed-log alerts", "Temperature Log", null, 21),
        new FeatureCatalogEntry(TemperatureLogScheduledChecks, "Scheduled checks", "Temperature Log", null, 22),
        new FeatureCatalogEntry(TemperatureLogFullHistory, "Full history", "Temperature Log", null, 23),

        // Refusal Log.
        new FeatureCatalogEntry(RefusalLogBasic, "Basic Refusal Log", "Refusal Log", null, 30),
        new FeatureCatalogEntry(RefusalLogAttachments, "Attachments", "Refusal Log", null, 31),
        new FeatureCatalogEntry(RefusalLogMultiManagerReview, "Multi-manager review", "Refusal Log", null, 32),
        new FeatureCatalogEntry(RefusalLogAnalytics, "Analytics", "Refusal Log", null, 33),
        new FeatureCatalogEntry(RefusalLogStaffReports, "Staff-wise reports", "Refusal Log", null, 34),

        // Compliance.
        new FeatureCatalogEntry(ComplianceBasic, "Basic Compliance", "Compliance", null, 40),
        new FeatureCatalogEntry(ComplianceDailyWeeklyMonthly, "Daily / Weekly / Monthly", "Compliance", null, 41),
        new FeatureCatalogEntry(ComplianceAdvanced, "Advanced Compliance", "Compliance", null, 42),
        new FeatureCatalogEntry(CompliancePhotoEvidence, "Photo evidence", "Compliance", null, 43),

        // Safe Drop.
        new FeatureCatalogEntry(SafeDropBasic, "Basic Safe Drop", "Safe Drop", null, 50),
        new FeatureCatalogEntry(SafeDropCanisterLimitAlerts, "Canister-limit alerts", "Safe Drop", null, 51),
        new FeatureCatalogEntry(SafeDropAdvanced, "Advanced Safe Drop", "Safe Drop", null, 52),
        new FeatureCatalogEntry(SafeDropApprovalWorkflow, "Approval workflow", "Safe Drop", null, 53),
        new FeatureCatalogEntry(SafeDropCashVariance, "Cash variance", "Safe Drop", null, 54),

        // Notifications.
        new FeatureCatalogEntry(NotificationsEmail, "Email notifications", "Notifications", null, 60),
        new FeatureCatalogEntry(NotificationsPush, "Push notifications", "Notifications", null, 61),
        new FeatureCatalogEntry(NotificationsWhatsApp, "WhatsApp notifications", "Notifications", null, 62),
        new FeatureCatalogEntry(NotificationsPriority, "Priority notifications", "Notifications", null, 63),

        // Dashboard.
        new FeatureCatalogEntry(DashboardBasic, "Basic dashboard", "Dashboard", null, 70),
        new FeatureCatalogEntry(DashboardAdvanced, "Advanced dashboard", "Dashboard", null, 71),
        new FeatureCatalogEntry(DashboardMultiShop, "Multi-shop dashboard", "Dashboard", null, 72),

        // Other.
        new FeatureCatalogEntry(AuditLogBasic, "Audit log", "Audit & Reports", null, 80),
        new FeatureCatalogEntry(ApprovalWorkflow, "Manager approval workflow", "Audit & Reports", null, 81),
        new FeatureCatalogEntry(ReportsAdvanced, "Advanced reports", "Audit & Reports", null, 82),
        new FeatureCatalogEntry(SupportPriority, "Priority support", "Support", null, 90),
    };
}
