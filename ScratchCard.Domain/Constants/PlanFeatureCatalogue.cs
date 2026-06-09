namespace ScratchCard.Domain.Constants;

/// <summary>
/// The canonical feature set per plan tier. The seed step uses this on first run, and the admin
/// endpoint <c>POST /api/admin/subscription-plans/{id}/sync-from-catalogue</c> uses it later to
/// (re-)align an existing plan against the latest catalogue — needed because seed deliberately
/// does NOT overwrite admin edits, so newly added feature keys never reach existing plans
/// without an explicit re-sync.
/// </summary>
public static class PlanFeatureCatalogue
{
    public static readonly IReadOnlyList<string> Starter = new[]
    {
        FeatureKeys.ScratchCardManagement, FeatureKeys.TemperatureLog, FeatureKeys.RefusalNoIdNoSale,
        FeatureKeys.ComplianceChecklist, FeatureKeys.SafeDropManagement,
        FeatureKeys.ScratchCardBasic,
        FeatureKeys.TemperatureLogBasic,
        FeatureKeys.RefusalLogBasic,
        FeatureKeys.ComplianceBasic,
        FeatureKeys.SafeDropBasic,
        FeatureKeys.VisitorLogBasic,
        FeatureKeys.StaffRota, FeatureKeys.StaffRotaBasic,
        FeatureKeys.NotificationsEmail,
        FeatureKeys.StoreSales, FeatureKeys.StoreSalesBasic, FeatureKeys.StoreSalesCounters,
    };

    public static readonly IReadOnlyList<string> Growth = ((IEnumerable<string>)Starter).Concat(new[]
    {
        FeatureKeys.ScratchCardAttachments, FeatureKeys.ScratchCardManualEntryAlerts,
        FeatureKeys.TemperatureLogMissedAlerts,
        FeatureKeys.RefusalLogAttachments, FeatureKeys.RefusalLogMultiManagerReview,
        FeatureKeys.ComplianceDailyWeeklyMonthly,
        FeatureKeys.SafeDropCanisterLimitAlerts,
        FeatureKeys.NotificationsPush, FeatureKeys.NotificationsWhatsApp,
        FeatureKeys.DashboardBasic,
        FeatureKeys.AuditLogBasic,
        // Store Sales (basic + counters inherited from Starter). Growth adds capture automation + oversight.
        FeatureKeys.StoreSalesOcr, FeatureKeys.StoreSalesMultiTill, FeatureKeys.StoreSalesDashboard,
        FeatureKeys.StoreSalesAlerts, FeatureKeys.StoreSalesPostOffice, FeatureKeys.StoreSalesAccountingExport,
        FeatureKeys.StaffRotaManualApproval, FeatureKeys.StaffRotaShiftReminders, FeatureKeys.StaffRotaTimesheetExport,
        FeatureKeys.StaffRotaLabourCost, FeatureKeys.StaffRotaShiftSwap,
    }).ToArray();

    public static readonly IReadOnlyList<string> Pro = ((IEnumerable<string>)Growth).Concat(new[]
    {
        FeatureKeys.ScratchCardAdvancedValidation,
        FeatureKeys.ScratchCardSuspiciousAlerts,
        FeatureKeys.TemperatureLogScheduledChecks, FeatureKeys.TemperatureLogFullHistory,
        FeatureKeys.RefusalLogAnalytics, FeatureKeys.RefusalLogStaffReports,
        FeatureKeys.ComplianceAdvanced, FeatureKeys.CompliancePhotoEvidence,
        FeatureKeys.SafeDropApprovalWorkflow, FeatureKeys.SafeDropCashVariance,
        FeatureKeys.NotificationsPriority,
        FeatureKeys.DashboardAdvanced, FeatureKeys.DashboardMultiShop,
        FeatureKeys.ApprovalWorkflow,
        FeatureKeys.ReportsAdvanced,
        FeatureKeys.SupportPriority,
        FeatureKeys.StoreSalesAi,
        FeatureKeys.StoreSalesSettlement,
    }).ToArray();

    public static IReadOnlyList<string>? ForTier(string? tier) => tier?.Trim().ToLowerInvariant() switch
    {
        "starter" => Starter,
        "growth" => Growth,
        "pro" => Pro,
        _ => null
    };
}
