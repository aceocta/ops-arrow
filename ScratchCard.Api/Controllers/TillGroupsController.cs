using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.DTOs.StoreSales;
using ScratchCard.Domain.Constants;

namespace ScratchCard.Api.Controllers;

// Per-shop custom reconciliation groups (sections) + the global built-ins. Owner/manager only;
// per-shop role + store_sales.basic feature enforced in the service.
[Route("api/till-groups")]
[Authorize(Roles = RoleNames.ManagementAndAbove)]
public class TillGroupsController : BaseApiController
{
    private readonly ITillGroupDefinitionService _service;

    public TillGroupsController(ITillGroupDefinitionService service)
    {
        _service = service;
    }

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] Guid shopId, CancellationToken cancellationToken)
        => Success(await _service.ListAsync(shopId, cancellationToken));

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateTillGroupRequest request, CancellationToken cancellationToken)
        => Success(await _service.CreateAsync(request, cancellationToken));

    [HttpPut]
    public async Task<IActionResult> Update([FromBody] UpdateTillGroupRequest request, CancellationToken cancellationToken)
        => Success(await _service.UpdateAsync(request, cancellationToken));

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        await _service.DeleteAsync(id, cancellationToken);
        return Success(true);
    }
}
