using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Reports;
using ScratchCard.Domain.Constants;

namespace ScratchCard.Api.Controllers;

[Route("api/reports")]
[Authorize(Roles = $"{RoleNames.ShopOwner},{RoleNames.Manager}")]
public class ReportsController : BaseApiController
{
    private readonly IReportService _reportService;

    public ReportsController(IReportService reportService)
    {
        _reportService = reportService;
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

    [HttpGet("stock")]
    public async Task<IActionResult> Stock([FromQuery] Guid shopId, CancellationToken cancellationToken)
    {
        var result = await _reportService.GetStockReportAsync(shopId, cancellationToken);
        return Success(result);
    }

    [HttpGet("audit-log")]
    public async Task<IActionResult> AuditLog([FromQuery] Guid shopId, [FromQuery] DateOnly from, [FromQuery] DateOnly to, CancellationToken cancellationToken)
    {
        var result = await _reportService.GetAuditLogReportAsync(shopId, from, to, cancellationToken);
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
        await _reportService.SendReportByEmailAsync(request, cancellationToken);
        return Success(true, "Report email sent.");
    }
}
