using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.DTOs.Rota;
using ScratchCard.Domain.Constants;

namespace ScratchCard.Api.Controllers;

// Shift swap / give-away. Per-shop role + staff_rota.shift_swap feature enforced in the service.
[Route("api/shift-swaps")]
[Authorize(Roles = RoleNames.AllAuthenticated)]
public class ShiftSwapsController : BaseApiController
{
    private readonly IShiftSwapService _service;

    public ShiftSwapsController(IShiftSwapService service)
    {
        _service = service;
    }

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] Guid shopId, CancellationToken cancellationToken)
        => Success(await _service.ListAsync(shopId, cancellationToken));

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateShiftSwapRequest request, CancellationToken cancellationToken)
        => Success(await _service.CreateAsync(request, cancellationToken));

    [HttpPost("{id:guid}/respond")]
    public async Task<IActionResult> Respond(Guid id, [FromQuery] bool accept, CancellationToken cancellationToken)
        => Success(await _service.RespondAsync(id, accept, cancellationToken));

    [HttpPost("{id:guid}/cancel")]
    public async Task<IActionResult> Cancel(Guid id, CancellationToken cancellationToken)
        => Success(await _service.CancelAsync(id, cancellationToken));
}
