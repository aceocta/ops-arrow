using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.TemperatureLogs;
using ScratchCard.Domain.Constants;

namespace ScratchCard.Api.Controllers;

[Route("api/temperature-logs")]
[Authorize(Roles = $"{RoleNames.ShopOwner},{RoleNames.Manager},{RoleNames.Cashier}")]
public class TemperatureLogsController : BaseApiController
{
    private readonly ITemperatureLogService _temperatureLogService;

    public TemperatureLogsController(ITemperatureLogService temperatureLogService)
    {
        _temperatureLogService = temperatureLogService;
    }

    [HttpGet("units")]
    public async Task<IActionResult> ListUnits([FromQuery] Guid shopId, CancellationToken cancellationToken)
    {
        var result = await _temperatureLogService.ListUnitsAsync(shopId, cancellationToken);
        return Success(result);
    }

    [HttpPost("units")]
    [Authorize(Roles = $"{RoleNames.ShopOwner},{RoleNames.Manager}")]
    public async Task<IActionResult> CreateUnit([FromBody] CreateTemperatureMonitoringUnitRequest request, CancellationToken cancellationToken)
    {
        var result = await _temperatureLogService.CreateUnitAsync(request, cancellationToken);
        return Success(result);
    }

    [HttpPut("units/{id:guid}")]
    [Authorize(Roles = $"{RoleNames.ShopOwner},{RoleNames.Manager}")]
    public async Task<IActionResult> UpdateUnit(Guid id, [FromBody] UpdateTemperatureMonitoringUnitRequest request, CancellationToken cancellationToken)
    {
        var result = await _temperatureLogService.UpdateUnitAsync(id, request, cancellationToken);
        return Success(result);
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
    [Authorize(Roles = $"{RoleNames.ShopOwner},{RoleNames.Manager}")]
    public async Task<IActionResult> SignOff([FromBody] SignOffTemperatureDailyLogRequest request, CancellationToken cancellationToken)
    {
        var result = await _temperatureLogService.SignOffDailyAsync(request, cancellationToken);
        return Success(result);
    }
}
