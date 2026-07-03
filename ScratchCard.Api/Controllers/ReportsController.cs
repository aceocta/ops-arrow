using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Api.Authorization;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Reports;
using ScratchCard.Application.Services;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Api.Controllers;

[Route("api/reports")]
[Authorize(Roles = RoleNames.OwnerAndManager)]
[RequireShopRole(RoleNames.CompanyOwner, RoleNames.Manager)]
public class ReportsController : BaseApiController
{
    private readonly IReportService _reportService;
    private readonly IFeatureGateService _featureGateService;

    public ReportsController(IReportService reportService, IFeatureGateService featureGateService)
    {
        _reportService = reportService;
        _featureGateService = featureGateService;
    }

    [HttpGet("daily-sales")]
    public async Task<IActionResult> DailySales([FromQuery] Guid shopId, [FromQuery] DateOnly from, [FromQuery] DateOnly to, CancellationToken cancellationToken)
    {
        var result = await _reportService.GetDailySalesAsync(shopId, from, to, cancellationToken);
        return Success(result);
    }

    [HttpGet("shift-sales")]
    public async Task<IActionResult> ShiftSales([FromQuery] Guid shopId, [FromQuery] DateOnly from, [FromQuery] DateOnly to, CancellationToken cancellationToken)
    {
        var result = await _reportService.GetShiftSalesAsync(shopId, from, to, cancellationToken);
        return Success(result);
    }

    [HttpGet("manual-entry-review")]
    public async Task<IActionResult> ManualEntryReview([FromQuery] Guid shopId, [FromQuery] DateOnly from, [FromQuery] DateOnly to, CancellationToken cancellationToken)
    {
        var result = await _reportService.GetManualEntryReviewAsync(shopId, from, to, cancellationToken);
        return Success(result);
    }

    [HttpGet("temperature-logs")]
    public async Task<IActionResult> TemperatureLogs(
        [FromQuery] Guid shopId,
        [FromQuery] DateOnly from,
        [FromQuery] DateOnly to,
        [FromQuery] Guid? unitId,
        [FromQuery] FoodCategory? category,
        [FromQuery] TemperatureResult? result,
        [FromQuery] string? checkedBy,
        CancellationToken cancellationToken)
    {
        var rows = await _reportService.GetTemperatureLogsReportAsync(shopId, from, to, unitId, category, result, checkedBy, cancellationToken);
        return Success(rows);
    }

    // §24 equipment-issue history: not-working / under-maintenance / resolved incidents, with the
    // corrective actions, food-discarded flag and manager-approval stamp on each.
    [HttpGet("temperature-issues")]
    public async Task<IActionResult> TemperatureIssues(
        [FromQuery] Guid shopId,
        [FromQuery] DateOnly from,
        [FromQuery] DateOnly to,
        [FromQuery] Guid? unitId,
        [FromQuery] FoodCategory? category,
        [FromQuery] EquipmentWorkingStatus? status,
        CancellationToken cancellationToken)
    {
        var rows = await _reportService.GetTemperatureIssuesReportAsync(shopId, from, to, unitId, category, status, cancellationToken);
        return Success(rows);
    }

    [HttpGet("temperature-schedule-grid")]
    // Overrides the controller-level OwnerAndManager gate: the temperature report grid is a read-only
    // view cashiers and sales assistants are allowed to see (same as the daily temperature log).
    [Authorize(Roles = RoleNames.OperationalRoles)]
    public async Task<IActionResult> TemperatureScheduleGrid(
        [FromQuery] Guid shopId,
        [FromQuery] DateOnly from,
        [FromQuery] DateOnly to,
        [FromQuery] Guid? unitId,
        CancellationToken cancellationToken)
    {
        var result = await _reportService.GetTemperatureScheduleGridAsync(shopId, from, to, unitId, cancellationToken);
        return Success(result);
    }

    [HttpGet("stock")]
    public async Task<IActionResult> Stock([FromQuery] Guid shopId, CancellationToken cancellationToken)
    {
        var result = await _reportService.GetStockReportAsync(shopId, cancellationToken);
        return Success(result);
    }

    [HttpGet("audit-log")]
    [RequireFeature(FeatureKeys.AuditLogBasic)]
    public async Task<IActionResult> AuditLog([FromQuery] Guid shopId, [FromQuery] DateOnly from, [FromQuery] DateOnly to, CancellationToken cancellationToken)
    {
        var result = await _reportService.GetAuditLogReportAsync(shopId, from, to, cancellationToken);
        return Success(result);
    }

    // Advanced reports (stock + sync-status surface tier-only data). Gated to Pro.
    [HttpGet("stock-advanced")]
    [RequireFeature(FeatureKeys.ReportsAdvanced)]
    public async Task<IActionResult> StockAdvanced([FromQuery] Guid shopId, CancellationToken cancellationToken)
    {
        var result = await _reportService.GetStockReportAsync(shopId, cancellationToken);
        return Success(result);
    }

    [HttpGet("notification-log")]
    public async Task<IActionResult> NotificationLog([FromQuery] Guid shopId, CancellationToken cancellationToken)
    {
        var result = await _reportService.GetNotificationLogReportAsync(shopId, cancellationToken);
        return Success(result);
    }

    [HttpGet("sync-status")]
    public async Task<IActionResult> SyncStatus([FromQuery] Guid shopId, [FromQuery] DateOnly from, [FromQuery] DateOnly to, CancellationToken cancellationToken)
    {
        var result = await _reportService.GetSyncStatusReportAsync(shopId, from, to, cancellationToken);
        return Success(result);
    }

    [HttpPost("email")]
    public async Task<IActionResult> EmailReport([FromBody] SendReportEmailRequest request, CancellationToken cancellationToken)
    {
        if (request.ShopId is Guid shopId && !string.IsNullOrWhiteSpace(request.ReportType))
        {
            // Per-shop, per-report-type monthly quota gate. Throws 403 with code
            // 'report_export_quota_exceeded' when the plan's ReportExportsPerMonth is reached.
            await _featureGateService.EnsureReportExportAllowedAsync(shopId, request.ReportType!, cancellationToken);
        }
        await _reportService.SendReportByEmailAsync(request, cancellationToken);
        return Success(true, "Report email sent.");
    }
}

