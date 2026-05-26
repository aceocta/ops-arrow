using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Api.Authorization;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Games;
using ScratchCard.Domain.Constants;

namespace ScratchCard.Api.Controllers;

[Route("api/games")]
[Authorize(Roles = RoleNames.ManagementAndAbove)]
public class GamesController : BaseApiController
{
    private readonly IGameService _gameService;

    public GamesController(IGameService gameService)
    {
        _gameService = gameService;
    }

    [HttpPost]
    [RequireShopRole(RoleNames.CompanyOwner, RoleNames.Manager)]
    public async Task<IActionResult> Create([FromBody] CreateGameRequest request, CancellationToken cancellationToken)
    {
        var result = await _gameService.CreateAsync(request, cancellationToken);
        return Success(result);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateGameRequest request, CancellationToken cancellationToken)
    {
        var result = await _gameService.UpdateAsync(id, request, cancellationToken);
        return Success(result);
    }

    [HttpGet]
    [Authorize]
    [RequireShopRole(RoleNames.CompanyOwner, RoleNames.Manager, RoleNames.Cashier, RoleNames.SalesAssistant)]
    public async Task<IActionResult> List([FromQuery] Guid shopId, CancellationToken cancellationToken)
    {
        var result = await _gameService.ListAsync(shopId, cancellationToken);
        return Success(result);
    }

    [HttpPost("{id:guid}/deactivate")]
    public async Task<IActionResult> Deactivate(Guid id, CancellationToken cancellationToken)
    {
        await _gameService.DeactivateAsync(id, cancellationToken);
        return Success(new { Updated = true });
    }
}

