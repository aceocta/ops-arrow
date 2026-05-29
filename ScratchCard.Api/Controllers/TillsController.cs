using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Api.Authorization;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.StoreSales;
using ScratchCard.Domain.Constants;

namespace ScratchCard.Api.Controllers;

[Route("api/tills")]
[Authorize(Roles = RoleNames.OperationalRoles)]
public class TillsController : BaseApiController
{
    private readonly ITillService _tillService;

    public TillsController(ITillService tillService)
    {
        _tillService = tillService;
    }

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] Guid shopId,
        [FromQuery] bool includeInactive = false,
        CancellationToken cancellationToken = default)
    {
        var result = await _tillService.ListAsync(shopId, includeInactive, cancellationToken);
        return Success(result);
    }

    [HttpPost]
    [Authorize(Roles = RoleNames.OwnerAndManager)]
    [RequireShopRole(RoleNames.CompanyOwner, RoleNames.Manager)]
    public async Task<IActionResult> Create([FromBody] CreateTillRequest request, CancellationToken cancellationToken)
    {
        var result = await _tillService.CreateAsync(request, cancellationToken);
        return Success(result);
    }

    [HttpPut("{id:guid}")]
    [Authorize(Roles = RoleNames.OwnerAndManager)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateTillRequest request, CancellationToken cancellationToken)
    {
        var result = await _tillService.UpdateAsync(id, request, cancellationToken);
        return Success(result);
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Roles = RoleNames.OwnerAndManager)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        await _tillService.DeleteAsync(id, cancellationToken);
        return Success(new { id });
    }
}
