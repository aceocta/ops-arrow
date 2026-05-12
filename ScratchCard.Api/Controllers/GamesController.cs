using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Games;
using ScratchCard.Domain.Constants;

namespace ScratchCard.Api.Controllers;

[Route("api/games")]
[Authorize(Roles = $"{RoleNames.ShopOwner},{RoleNames.Manager},{RoleNames.PlatformAdmin}")]
public class GamesController : BaseApiController
{
    private readonly IGameService _gameService;

    public GamesController(IGameService gameService)
    {
        _gameService = gameService;
    }

    [HttpPost]
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
