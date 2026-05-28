using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.ShiftSales;
using ScratchCard.Domain.Constants;

namespace ScratchCard.Api.Controllers;

[Route("api/shift-sales")]
[Authorize(Roles = RoleNames.OperationalRoles)]
public class ShiftSalesController : BaseApiController
{
    private readonly IShiftSalesService _shiftSalesService;

    public ShiftSalesController(IShiftSalesService shiftSalesService)
    {
        _shiftSalesService = shiftSalesService;
    }

    [HttpPost("{shiftId:guid}/submit")]
    public async Task<IActionResult> Submit(Guid shiftId, [FromBody] FinalizeShiftRequest request, CancellationToken cancellationToken)
    {
        var result = await _shiftSalesService.SubmitShiftCloseSalesAsync(shiftId, request, cancellationToken);
        return Success(result);
    }

    [HttpPost("sync-offline")]
    public async Task<IActionResult> SyncOffline([FromBody] OfflineSyncShiftCloseRequest request, CancellationToken cancellationToken)
    {
        var result = await _shiftSalesService.SyncOfflineShiftCloseAsync(request, cancellationToken);
        return Success(result);
    }

    [HttpGet("{shiftId:guid}")]
    public async Task<IActionResult> GetShiftSales(Guid shiftId, CancellationToken cancellationToken)
    {
        var result = await _shiftSalesService.GetShiftSalesAsync(shiftId, cancellationToken);
        return Success(result);
    }

    // --- Closing-number staging store (entered on the dedicated screen, consumed by finalize) ---

    [HttpGet("{shiftId:guid}/closing-numbers")]
    public async Task<IActionResult> ListClosingNumbers(Guid shiftId, CancellationToken cancellationToken)
    {
        var result = await _shiftSalesService.ListClosingNumbersAsync(shiftId, cancellationToken);
        return Success(result);
    }

    [HttpPut("{shiftId:guid}/closing-numbers")]
    public async Task<IActionResult> UpsertClosingNumber(Guid shiftId, [FromBody] UpsertShiftPackClosingRequest request, CancellationToken cancellationToken)
    {
        var result = await _shiftSalesService.UpsertClosingNumberAsync(shiftId, request, cancellationToken);
        return Success(result);
    }

    [HttpDelete("{shiftId:guid}/closing-numbers/{packId:guid}")]
    public async Task<IActionResult> DeleteClosingNumber(Guid shiftId, Guid packId, CancellationToken cancellationToken)
    {
        await _shiftSalesService.DeleteClosingNumberAsync(shiftId, packId, cancellationToken);
        return Success(true);
    }
}

