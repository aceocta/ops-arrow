using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Api.Authorization;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.StoreSales;
using ScratchCard.Domain.Constants;

namespace ScratchCard.Api.Controllers;

[Route("api/shop-payment-types")]
[Authorize(Roles = RoleNames.OperationalRoles)]
public class ShopPaymentTypesController : BaseApiController
{
    private readonly IShopPaymentTypeService _service;

    public ShopPaymentTypesController(IShopPaymentTypeService service)
    {
        _service = service;
    }

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] Guid shopId,
        [FromQuery] bool includeInactive = false,
        CancellationToken cancellationToken = default)
    {
        var result = await _service.ListAsync(shopId, includeInactive, cancellationToken);
        return Success(result);
    }

    [HttpPost]
    [Authorize(Roles = RoleNames.OwnerAndManager)]
    [RequireShopRole(RoleNames.CompanyOwner, RoleNames.Manager)]
    public async Task<IActionResult> Create([FromBody] CreateShopPaymentTypeRequest request, CancellationToken cancellationToken)
    {
        var result = await _service.CreateAsync(request, cancellationToken);
        return Success(result);
    }

    [HttpPut("{id:guid}")]
    [Authorize(Roles = RoleNames.OwnerAndManager)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateShopPaymentTypeRequest request, CancellationToken cancellationToken)
    {
        var result = await _service.UpdateAsync(id, request, cancellationToken);
        return Success(result);
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Roles = RoleNames.OwnerAndManager)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        await _service.DeleteAsync(id, cancellationToken);
        return Success(new { id });
    }

    [HttpPost("seed-defaults")]
    [Authorize(Roles = RoleNames.OwnerAndManager)]
    [RequireShopRole(RoleNames.CompanyOwner, RoleNames.Manager)]
    public async Task<IActionResult> SeedDefaults([FromQuery] Guid shopId, CancellationToken cancellationToken)
    {
        var result = await _service.SeedDefaultsAsync(shopId, cancellationToken);
        return Success(result);
    }
}
