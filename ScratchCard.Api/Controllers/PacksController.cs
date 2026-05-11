using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Packs;
using ScratchCard.Domain.Constants;

namespace ScratchCard.Api.Controllers;

[Route("api/packs")]
[Authorize(Roles = $"{RoleNames.ShopOwner},{RoleNames.Manager},{RoleNames.Cashier}")]
public class PacksController : BaseApiController
{
    private readonly IPackService _packService;

    public PacksController(IPackService packService)
    {
        _packService = packService;
    }

    [HttpPost("manual")]
    public async Task<IActionResult> CreateManual([FromBody] CreateManualPackRequest request, CancellationToken cancellationToken)
    {
        var result = await _packService.CreateManualAsync(request, cancellationToken);
        return Success(result);
    }

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] Guid shopId, CancellationToken cancellationToken)
    {
        var result = await _packService.ListAsync(shopId, cancellationToken);
        return Success(result);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken cancellationToken)
    {
        var result = await _packService.GetAsync(id, cancellationToken);
        return Success(result);
    }

    [HttpPut("{id:guid}")]
    [Authorize(Roles = $"{RoleNames.ShopOwner},{RoleNames.Manager}")]
    public async Task<IActionResult> UpdateDetails(Guid id, [FromBody] UpdatePackDetailsRequest request, CancellationToken cancellationToken)
    {
        var result = await _packService.UpdateDetailsAsync(id, request, cancellationToken);
        return Success(result);
    }

    [HttpPost("{id:guid}/activate")]
    [Authorize(Roles = $"{RoleNames.ShopOwner},{RoleNames.Manager}")]
    public async Task<IActionResult> Activate(Guid id, [FromBody] ActivatePackRequest request, CancellationToken cancellationToken)
    {
        var result = await _packService.ActivateAsync(id, request, cancellationToken);
        return Success(result);
    }

    [HttpPost("{id:guid}/pause")]
    [Authorize(Roles = $"{RoleNames.ShopOwner},{RoleNames.Manager}")]
    public async Task<IActionResult> Pause(Guid id, [FromBody] UpdatePackStatusRequest request, CancellationToken cancellationToken)
    {
        var result = await _packService.PauseAsync(id, request, cancellationToken);
        return Success(result);
    }

    [HttpPost("{id:guid}/return")]
    [Authorize(Roles = $"{RoleNames.ShopOwner},{RoleNames.Manager}")]
    public async Task<IActionResult> Return(Guid id, [FromBody] UpdatePackStatusRequest request, CancellationToken cancellationToken)
    {
        var result = await _packService.ReturnAsync(id, request, cancellationToken);
        return Success(result);
    }

    [HttpPost("{id:guid}/issue")]
    [Authorize(Roles = $"{RoleNames.ShopOwner},{RoleNames.Manager}")]
    public async Task<IActionResult> MarkIssue(Guid id, [FromBody] UpdatePackStatusRequest request, CancellationToken cancellationToken)
    {
        var result = await _packService.MarkIssueAsync(id, request, cancellationToken);
        return Success(result);
    }

    [HttpPost("{id:guid}/complete")]
    [Authorize(Roles = $"{RoleNames.ShopOwner},{RoleNames.Manager}")]
    public async Task<IActionResult> Complete(Guid id, [FromBody] UpdatePackStatusRequest request, CancellationToken cancellationToken)
    {
        var result = await _packService.CompleteAsync(id, request, cancellationToken);
        return Success(result);
    }
}
