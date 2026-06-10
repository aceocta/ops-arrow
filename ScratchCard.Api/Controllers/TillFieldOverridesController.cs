using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.DTOs.StoreSales;
using ScratchCard.Domain.Constants;

namespace ScratchCard.Api.Controllers;

// Per-shop overrides of a canonical till field's category / VAT / ledger. Owner/manager only;
// per-shop role + store_sales.basic feature enforced in the service.
[Route("api/till-field-overrides")]
[Authorize(Roles = RoleNames.ManagementAndAbove)]
public class TillFieldOverridesController : BaseApiController
{
    private readonly ITillFieldOverrideService _service;

    public TillFieldOverridesController(ITillFieldOverrideService service)
    {
        _service = service;
    }

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] Guid shopId, CancellationToken cancellationToken)
        => Success(await _service.ListAsync(shopId, cancellationToken));

    [HttpPost]
    public async Task<IActionResult> Upsert([FromBody] UpsertTillFieldOverrideRequest request, CancellationToken cancellationToken)
        => Success(await _service.UpsertAsync(request, cancellationToken));

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        await _service.DeleteAsync(id, cancellationToken);
        return Success(true);
    }

    // Copy a source shop's till-reconciliation config to other shops in the same company.
    [HttpPost("copy")]
    public async Task<IActionResult> Copy([FromBody] CopyTillConfigRequest request, CancellationToken cancellationToken)
        => Success(new { updated = await _service.CopyToShopsAsync(request, cancellationToken) });
}
