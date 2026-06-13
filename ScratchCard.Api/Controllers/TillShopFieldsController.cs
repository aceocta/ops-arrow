using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.DTOs.StoreSales;
using ScratchCard.Domain.Constants;

namespace ScratchCard.Api.Controllers;

// A shop's own custom till fields (line items) with in/out/none cash behaviour. Owner/manager only;
// per-shop role + store_sales.basic feature enforced in the service.
[Route("api/till-shop-fields")]
[Authorize(Roles = RoleNames.ManagementAndAbove)]
public class TillShopFieldsController : BaseApiController
{
    private readonly ITillShopFieldService _service;

    public TillShopFieldsController(ITillShopFieldService service)
    {
        _service = service;
    }

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] Guid shopId, CancellationToken cancellationToken)
        => Success(await _service.ListAsync(shopId, cancellationToken));

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateTillShopFieldRequest request, CancellationToken cancellationToken)
        => Success(await _service.CreateAsync(request, cancellationToken));

    [HttpPut]
    public async Task<IActionResult> Update([FromBody] UpdateTillShopFieldRequest request, CancellationToken cancellationToken)
        => Success(await _service.UpdateAsync(request, cancellationToken));

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        await _service.DeleteAsync(id, cancellationToken);
        return Success(true);
    }
}
