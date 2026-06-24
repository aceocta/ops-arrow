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
        // Returns either the created (pending) game or a "DuplicateExists" result for the app to prompt on.
        var result = await _gameService.CreateAsync(request, cancellationToken);
        return Success(result);
    }

    // Duplicate-prompt action: link an existing master game to this shop or all the company's shops.
    [HttpPost("assign-existing")]
    [RequireShopRole(RoleNames.CompanyOwner, RoleNames.Manager)]
    public async Task<IActionResult> AssignExisting([FromBody] AssignExistingGameRequest request, CancellationToken cancellationToken)
    {
        var result = await _gameService.AssignExistingAsync(request, cancellationToken);
        return Success(result);
    }

    // --- Platform owner approval queue (PlatformAdmin only) ---
    [HttpGet("pending")]
    [Authorize(Roles = RoleNames.PlatformAdmin)]
    public async Task<IActionResult> ListPending(CancellationToken cancellationToken)
    {
        var result = await _gameService.ListPendingAsync(cancellationToken);
        return Success(result);
    }

    [HttpPost("{id:guid}/approve")]
    [Authorize(Roles = RoleNames.PlatformAdmin)]
    public async Task<IActionResult> Approve(Guid id, CancellationToken cancellationToken)
    {
        await _gameService.ApproveAsync(id, cancellationToken);
        return Success(new { Approved = true });
    }

    [HttpPost("{id:guid}/reject")]
    [Authorize(Roles = RoleNames.PlatformAdmin)]
    public async Task<IActionResult> Reject(Guid id, [FromBody] RejectGameRequest request, CancellationToken cancellationToken)
    {
        await _gameService.RejectAsync(id, request.Reason, cancellationToken);
        return Success(new { Rejected = true });
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

