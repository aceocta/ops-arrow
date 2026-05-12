using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Shifts;
using ScratchCard.Application.DTOs.ShiftSales;
using ScratchCard.Domain.Constants;

namespace ScratchCard.Api.Controllers;

[Route("api/shifts")]
[Authorize(Roles = $"{RoleNames.ShopOwner},{RoleNames.Manager},{RoleNames.Cashier}")]
public class ShiftsController : BaseApiController
{
    private readonly IShiftService _shiftService;

    public ShiftsController(IShiftService shiftService)
    {
        _shiftService = shiftService;
    }

    [HttpPost("open")]
    public async Task<IActionResult> Open([FromBody] OpenShiftRequest request, CancellationToken cancellationToken)
    {
        var result = await _shiftService.OpenAsync(request, cancellationToken);
        return Success(result);
    }

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] Guid shopId, [FromQuery] Guid? businessDayId, CancellationToken cancellationToken)
    {
        var result = await _shiftService.ListAsync(shopId, businessDayId, cancellationToken);
        return Success(result);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken cancellationToken)
    {
        var result = await _shiftService.GetAsync(id, cancellationToken);
        return Success(result);
    }

    [HttpPost("{id:guid}/close")]
    public async Task<IActionResult> Close(Guid id, [FromBody] FinalizeShiftRequest request, CancellationToken cancellationToken)
    {
        var result = await _shiftService.CloseAsync(id, request, false, cancellationToken);
        return Success(result);
    }

    [HttpPost("{id:guid}/reopen")]
    [Authorize(Roles = $"{RoleNames.ShopOwner},{RoleNames.Manager}")]
    public async Task<IActionResult> Reopen(Guid id, [FromBody] ReopenShiftRequest request, CancellationToken cancellationToken)
    {
        var result = await _shiftService.ReopenAsync(id, request, cancellationToken);
        return Success(result);
    }

    [HttpGet("{id:guid}/active-packs")]
    public async Task<IActionResult> ActivePacks(Guid id, CancellationToken cancellationToken)
    {
        var result = await _shiftService.GetActivePacksForShiftCloseAsync(id, cancellationToken);
        return Success(result);
    }
}
