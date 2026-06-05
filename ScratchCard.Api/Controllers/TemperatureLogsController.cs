using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Api.Authorization;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.TemperatureLogs;
using ScratchCard.Application.Services;
using ScratchCard.Domain.Constants;

namespace ScratchCard.Api.Controllers;

[Route("api/temperature-logs")]
[Authorize(Roles = RoleNames.OperationalRoles)]
public class TemperatureLogsController : BaseApiController
{
    // Plans without temperature_log.full_history may only query a recent window of readings.
    private const int LimitedHistoryDays = 30;

    private readonly ITemperatureLogService _temperatureLogService;
    private readonly IFeatureGateService _featureGateService;

    public TemperatureLogsController(ITemperatureLogService temperatureLogService, IFeatureGateService featureGateService)
    {
        _temperatureLogService = temperatureLogService;
        _featureGateService = featureGateService;
    }

    [HttpGet("units")]
    public async Task<IActionResult> ListUnits([FromQuery] Guid shopId, CancellationToken cancellationToken)
    {
        var result = await _temperatureLogService.ListUnitsAsync(shopId, cancellationToken);
        return Success(result);
    }

    [HttpPost("units")]
    [RequireShopRole(RoleNames.CompanyOwner, RoleNames.Manager, RoleNames.Cashier, RoleNames.SalesAssistant)]
    public async Task<IActionResult> CreateUnit([FromBody] CreateTemperatureMonitoringUnitRequest request, CancellationToken cancellationToken)
    {
        var result = await _temperatureLogService.CreateUnitAsync(request, cancellationToken);
        return Success(result);
    }

    [HttpPut("units/{id:guid}")]
    public async Task<IActionResult> UpdateUnit(Guid id, [FromBody] UpdateTemperatureMonitoringUnitRequest request, CancellationToken cancellationToken)
    {
        var result = await _temperatureLogService.UpdateUnitAsync(id, request, cancellationToken);
        return Success(result);
    }

    [HttpPut("units/reorder")]
    public async Task<IActionResult> ReorderUnits([FromBody] ReorderTemperatureUnitsRequest request, CancellationToken cancellationToken)
    {
        await _temperatureLogService.ReorderUnitsAsync(request, cancellationToken);
        return Success(true, "Temperature units reordered.");
    }

    [HttpPost("readings")]
    public async Task<IActionResult> RecordReading([FromBody] RecordTemperatureReadingRequest request, CancellationToken cancellationToken)
    {
        var result = await _temperatureLogService.RecordReadingAsync(request, cancellationToken);
        return Success(result);
    }

    [HttpGet("readings")]
    public async Task<IActionResult> ListReadings(
        [FromQuery] Guid shopId,
        [FromQuery] DateOnly from,
        [FromQuery] DateOnly to,
        [FromQuery] Guid? unitId,
        CancellationToken cancellationToken)
    {
        // Plans without temperature_log.full_history are limited to a 30-day rolling window.
        if (!await _featureGateService.HasFeatureAsync(shopId, FeatureKeys.TemperatureLogFullHistory, cancellationToken))
        {
            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            var earliestAllowed = today.AddDays(-LimitedHistoryDays);
            if (from < earliestAllowed)
            {
                throw new AppException(
                    "temperature_history_limited",
                    $"Your plan allows up to {LimitedHistoryDays} days of temperature history. Upgrade to view older data.",
                    403);
            }
        }

        var result = await _temperatureLogService.ListReadingsAsync(shopId, from, to, unitId, cancellationToken);
        return Success(result);
    }

    [HttpGet("daily")]
    public async Task<IActionResult> Daily([FromQuery] Guid shopId, [FromQuery] DateOnly date, CancellationToken cancellationToken)
    {
        var result = await _temperatureLogService.GetDailyLogAsync(shopId, date, cancellationToken);
        return Success(result);
    }

    [HttpPost("signoff")]
    [Authorize(Roles = RoleNames.OwnerAndManager)]
    [RequireShopRole(RoleNames.CompanyOwner, RoleNames.Manager)]
    public async Task<IActionResult> SignOff([FromBody] SignOffTemperatureDailyLogRequest request, CancellationToken cancellationToken)
    {
        var result = await _temperatureLogService.SignOffDailyAsync(request, cancellationToken);
        return Success(result);
    }

    // Pro-only: configure expected reading slots for each day. The background sweeper compares
    // recorded readings against these slots and alerts on misses.
    [HttpGet("schedules")]
    public async Task<IActionResult> ListSchedules([FromQuery] Guid shopId, CancellationToken cancellationToken)
    {
        var result = await _temperatureLogService.ListSchedulesAsync(shopId, cancellationToken);
        return Success(result);
    }

    [HttpPost("schedules")]
    [Authorize(Roles = RoleNames.OwnerAndManager)]
    [RequireShopRole(RoleNames.CompanyOwner, RoleNames.Manager)]
    public async Task<IActionResult> CreateSchedule([FromBody] UpsertTemperatureScheduleRequest request, CancellationToken cancellationToken)
    {
        var result = await _temperatureLogService.CreateScheduleAsync(request, cancellationToken);
        return Success(result);
    }

    [HttpPut("schedules/{id:guid}")]
    [Authorize(Roles = RoleNames.OwnerAndManager)]
    public async Task<IActionResult> UpdateSchedule(Guid id, [FromBody] UpsertTemperatureScheduleRequest request, CancellationToken cancellationToken)
    {
        var result = await _temperatureLogService.UpdateScheduleAsync(id, request, cancellationToken);
        return Success(result);
    }

    [HttpDelete("schedules/{id:guid}")]
    [Authorize(Roles = RoleNames.OwnerAndManager)]
    public async Task<IActionResult> DeleteSchedule(Guid id, CancellationToken cancellationToken)
    {
        await _temperatureLogService.DeleteScheduleAsync(id, cancellationToken);
        return Success(new { Deleted = true });
    }
}

