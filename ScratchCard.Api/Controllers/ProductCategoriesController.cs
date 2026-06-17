using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.DTOs.Products;
using ScratchCard.Domain.Constants;

namespace ScratchCard.Api.Controllers;

// Product categories + per-category expiry reminder rules. Listing is open to operational roles
// (staff pick a category when adding stock); create/update/delete is management-only. Per-shop role
// + product_expiry.basic feature are enforced in the service.
[Route("api/product-categories")]
[Authorize(Roles = RoleNames.OperationalRoles)]
public class ProductCategoriesController : BaseApiController
{
    private readonly IProductCategoryService _service;

    public ProductCategoriesController(IProductCategoryService service)
    {
        _service = service;
    }

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] Guid shopId, CancellationToken cancellationToken)
        => Success(await _service.ListAsync(shopId, cancellationToken));

    [HttpPost]
    [Authorize(Roles = RoleNames.ManagementAndAbove)]
    public async Task<IActionResult> Create([FromBody] CreateProductCategoryRequest request, CancellationToken cancellationToken)
        => Success(await _service.CreateAsync(request, cancellationToken));

    [HttpPut]
    [Authorize(Roles = RoleNames.ManagementAndAbove)]
    public async Task<IActionResult> Update([FromBody] UpdateProductCategoryRequest request, CancellationToken cancellationToken)
        => Success(await _service.UpdateAsync(request, cancellationToken));

    [HttpDelete("{id:guid}")]
    [Authorize(Roles = RoleNames.ManagementAndAbove)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        await _service.DeleteAsync(id, cancellationToken);
        return Success(true);
    }
}
