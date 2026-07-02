using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.DTOs.Products;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Api.Controllers;

// Product expiry tracking: add products any time, list by derived status, record save actions, and
// the binned-vs-saved scoreboard. Operational roles can add/list/act; the scoreboard is
// management-only. Per-shop role + product_expiry feature gates are enforced in the service.
[Route("api/product-expiry")]
[Authorize(Roles = RoleNames.OperationalRoles)]
public class ProductExpiryController : BaseApiController
{
    private readonly IProductExpiryService _service;

    public ProductExpiryController(IProductExpiryService service)
    {
        _service = service;
    }

    [HttpPost]
    public async Task<IActionResult> Add([FromBody] AddProductRequest request, CancellationToken cancellationToken)
        => Success(await _service.AddAsync(request, cancellationToken));

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateProductRequest request, CancellationToken cancellationToken)
    {
        request.Id = id; // route is the source of truth for which batch is edited
        return Success(await _service.UpdateAsync(request, cancellationToken));
    }

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] Guid shopId, [FromQuery] ProductExpiryStatus? status, CancellationToken cancellationToken)
        => Success(await _service.ListAsync(shopId, status, cancellationToken));

    [HttpGet("lookup")]
    public async Task<IActionResult> Lookup([FromQuery] Guid shopId, [FromQuery] string barcode, CancellationToken cancellationToken)
        => Success(await _service.LookupByBarcodeAsync(shopId, barcode, cancellationToken));

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken cancellationToken)
        => Success(await _service.GetAsync(id, cancellationToken));

    [HttpPost("actions")]
    public async Task<IActionResult> RecordAction([FromBody] RecordProductActionRequest request, CancellationToken cancellationToken)
        => Success(await _service.RecordActionAsync(request, cancellationToken));

    [HttpGet("history")]
    public async Task<IActionResult> History([FromQuery] Guid shopId, [FromQuery] DateOnly from, [FromQuery] DateOnly to, CancellationToken cancellationToken)
        => Success(await _service.GetActionHistoryAsync(shopId, from, to, cancellationToken));

    [HttpGet("scoreboard")]
    [Authorize(Roles = RoleNames.ManagementAndAbove)]
    public async Task<IActionResult> Scoreboard([FromQuery] Guid shopId, [FromQuery] DateOnly from, [FromQuery] DateOnly to, CancellationToken cancellationToken)
        => Success(await _service.GetScoreboardAsync(shopId, from, to, cancellationToken));
}
