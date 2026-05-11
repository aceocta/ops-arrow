using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.PrizePayouts;
using ScratchCard.Domain.Constants;

namespace ScratchCard.Api.Controllers;

[Route("api/prize-payouts")]
[Authorize(Roles = $"{RoleNames.ShopOwner},{RoleNames.Manager},{RoleNames.Cashier}")]
public class PrizePayoutsController : BaseApiController
{
    private readonly IPrizePayoutService _prizePayoutService;

    public PrizePayoutsController(IPrizePayoutService prizePayoutService)
    {
        _prizePayoutService = prizePayoutService;
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreatePrizePayoutRequest request, CancellationToken cancellationToken)
    {
        var result = await _prizePayoutService.CreateAsync(request, cancellationToken);
        return Success(result);
    }

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] Guid shiftId, CancellationToken cancellationToken)
    {
        var result = await _prizePayoutService.ListAsync(shiftId, cancellationToken);
        return Success(result);
    }

    [HttpPost("{id:guid}/approve")]
    [Authorize(Roles = $"{RoleNames.ShopOwner},{RoleNames.Manager}")]
    public async Task<IActionResult> Approve(Guid id, [FromBody] ApprovePrizePayoutRequest request, CancellationToken cancellationToken)
    {
        var result = await _prizePayoutService.ApproveAsync(id, request, cancellationToken);
        return Success(result);
    }
}
