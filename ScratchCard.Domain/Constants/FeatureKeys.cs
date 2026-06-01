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
    public const string StoreSales = "StoreSales";
    public const string VisitorsLog = "VisitorsLog";

    // --- Scratch Card Management ---
    public const string ScratchCardBasic = "scratch_card.basic";
    public const string ScratchCardAttachments = "scratch_card.attachments";
    public const string ScratchCardManualEntryAlerts = "scratch_card.manual_entry_alerts";
    public const string ScratchCardAdvancedValidation = "scratch_card.advanced_validation";
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
    public const string SafeDropApprovalWorkflow = "safe_drop.approval_workflow";
    public const string SafeDropCashVariance = "safe_drop.cash_variance";

    // --- Store Sales (till report import) ---
    public const string StoreSalesBasic = "store_sales.basic";
    public const string StoreSalesAi = "store_sales.ai";

    // --- Visitors Log ---
    public const string VisitorLogBasic = "visitor_log.basic";
    public const string VisitorLogAttachments = "visitor_log.attachments";
    public const string VisitorLogContractorPermits = "visitor_log.contractor_permits";
    public const string VisitorLogInspectorAlerts = "visitor_log.inspector_alerts";
    public const string VisitorLogReports = "visitor_log.reports";

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

    // --- Not yet enforced ---
    //   dashboard.basic / .advanced / .multi_shop → deferred. No dashboard endpoint exists yet;
    //                                              gate goes on the endpoint when it lands.
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
        new FeatureCatalogEntry(StoreSales, "Store Sales", "Modules", "Top-level Store Sales / till-report import module.", 6),
        new FeatureCatalogEntry(VisitorsLog, "Visitors Log", "Modules", "Top-level Visitors / contractor sign-in module.", 7),

        // Scratch Card.
        new FeatureCatalogEntry(ScratchCardBasic, "Basic Scratch Card", "Scratch Card", null, 10),
        new FeatureCatalogEntry(ScratchCardAttachments, "Attachments", "Scratch Card", null, 11),
        new FeatureCatalogEntry(ScratchCardManualEntryAlerts, "Manual-entry alerts", "Scratch Card", null, 12),
        new FeatureCatalogEntry(ScratchCardAdvancedValidation, "Advanced validation", "Scratch Card", null, 13),
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
        new FeatureCatalogEntry(SafeDropApprovalWorkflow, "Approval workflow", "Safe Drop", null, 53),
        new FeatureCatalogEntry(SafeDropCashVariance, "Cash variance", "Safe Drop", null, 54),

        // Store Sales (till report import).
        new FeatureCatalogEntry(StoreSalesBasic, "Basic Store Sales", "Store Sales", "Capture, manual classify, tender editor.", 55),
        new FeatureCatalogEntry(StoreSalesAi, "AI auto-categorisation", "Store Sales", "AI-driven categorisation of till lines.", 56),

        // Visitors Log.
        new FeatureCatalogEntry(VisitorLogBasic, "Basic Visitors Log", "Visitors Log", "Sign in/out, on-site roll call, daily register.", 57),
        new FeatureCatalogEntry(VisitorLogAttachments, "Photo capture", "Visitors Log", "Optional visitor/ID photo on sign-in.", 58),
        new FeatureCatalogEntry(VisitorLogContractorPermits, "Contractor permits (forecourt)", "Visitors Log", "SPA passport / permit-to-work / induction fields for fuel sites.", 59),
        new FeatureCatalogEntry(VisitorLogInspectorAlerts, "Inspector alerts", "Visitors Log", "Notify managers when an inspector signs in.", 60),
        new FeatureCatalogEntry(VisitorLogReports, "Visitor reports", "Visitors Log", "Date-range register report with print / share / email.", 61),

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

    // Top-level modules that can be toggled off per-shop in Shop Settings. Order = display
    // order in the toggle UI.
    public static readonly IReadOnlyList<FeatureCatalogEntry> ToggleableModules = new[]
    {
        new FeatureCatalogEntry(ScratchCardManagement, "Scratch Card", "Modules", "Pack tracking, sales, scratch-card workflow.", 1),
        new FeatureCatalogEntry(SafeDropManagement,    "Safe Drop",    "Modules", "Canister drops, cash variance, approval workflow.", 2),
        new FeatureCatalogEntry(TemperatureLog,        "Temperature Log", "Modules", "Fridge/freezer temperature logging and alerts.", 3),
        new FeatureCatalogEntry(RefusalNoIdNoSale,     "Refusal Log",  "Modules", "Refusal / No-ID-No-Sale register.", 4),
        new FeatureCatalogEntry(ComplianceChecklist,   "Compliance Check", "Modules", "Daily / weekly / monthly compliance checklists.", 5),
        new FeatureCatalogEntry(StoreSales,             "Store Sales",  "Modules", "Till-report capture, OCR/AI categorisation, tender tracking.", 6),
        new FeatureCatalogEntry(VisitorsLog,            "Visitors Log", "Modules", "Visitor / contractor sign-in, on-site roll call, reports.", 7),
    };

    // Map each top-level module to the granular feature keys it covers. Disabling a module at
    // the shop level should also disable every granular feature listed here.
    public static readonly IReadOnlyDictionary<string, IReadOnlyList<string>> ModuleChildKeys =
        new Dictionary<string, IReadOnlyList<string>>
        {
            [ScratchCardManagement] = new[]
            {
                ScratchCardBasic, ScratchCardAttachments, ScratchCardManualEntryAlerts,
                ScratchCardAdvancedValidation, ScratchCardSuspiciousAlerts,
            },
            [TemperatureLog] = new[]
            {
                TemperatureLogBasic, TemperatureLogMissedAlerts, TemperatureLogScheduledChecks, TemperatureLogFullHistory,
            },
            [RefusalNoIdNoSale] = new[]
            {
                RefusalLogBasic, RefusalLogAttachments, RefusalLogMultiManagerReview, RefusalLogAnalytics, RefusalLogStaffReports,
            },
            [ComplianceChecklist] = new[]
            {
                ComplianceBasic, ComplianceDailyWeeklyMonthly, ComplianceAdvanced, CompliancePhotoEvidence,
            },
            [SafeDropManagement] = new[]
            {
                SafeDropBasic, SafeDropCanisterLimitAlerts, SafeDropApprovalWorkflow, SafeDropCashVariance,
            },
            [StoreSales] = new[]
            {
                StoreSalesBasic, StoreSalesAi,
            },
            [VisitorsLog] = new[]
            {
                VisitorLogBasic, VisitorLogAttachments, VisitorLogContractorPermits,
                VisitorLogInspectorAlerts, VisitorLogReports,
            },
        };

    /// <summary>
    /// Returns the module key plus all of its granular child keys for an entry in
    /// <see cref="ModuleChildKeys"/>; for any other key, just returns the key itself.
    /// </summary>
    public static IEnumerable<string> ExpandModuleKeys(string moduleKey)
    {
        yield return moduleKey;
        if (ModuleChildKeys.TryGetValue(moduleKey, out var children))
        {
            foreach (var c in children) yield return c;
        }
    }

    /// <summary>
    /// True if the supplied feature key is covered by any of the disabled module keys (matches
    /// the disabled key directly, or is a child of a disabled module).
    /// </summary>
    public static bool IsKeyDisabledByModules(string featureKey, IEnumerable<string>? disabledModuleKeys)
    {
        if (disabledModuleKeys is null) return false;
        foreach (var disabled in disabledModuleKeys)
        {
            if (string.Equals(disabled, featureKey, StringComparison.Ordinal)) return true;
            if (ModuleChildKeys.TryGetValue(disabled, out var children)
                && children.Contains(featureKey, StringComparer.Ordinal))
            {
                return true;
            }
        }
        return false;
    }
}
