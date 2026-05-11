using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Shops;
using ScratchCard.Domain.Constants;

namespace ScratchCard.Api.Controllers;

[Route("api/shops")]
[Authorize]
public class ShopsController : BaseApiController
{
    private readonly IShopService _shopService;

    public ShopsController(IShopService shopService)
    {
        _shopService = shopService;
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateShopRequest request, CancellationToken cancellationToken)
    {
        var result = await _shopService.CreateAsync(request, cancellationToken);
        return Success(result);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateShopRequest request, CancellationToken cancellationToken)
    {
        var result = await _shopService.UpdateAsync(id, request, cancellationToken);
        return Success(result);
    }

    [HttpGet("{id:guid}")]
    [Authorize]
    public async Task<IActionResult> Get(Guid id, CancellationToken cancellationToken)
    {
        var result = await _shopService.GetAsync(id, cancellationToken);
        return Success(result);
    }

    [HttpGet]
    [Authorize]
    public async Task<IActionResult> List([FromQuery] Guid? companyId, CancellationToken cancellationToken)
    {
        var result = await _shopService.ListAsync(companyId, cancellationToken);
        return Success(result);
    }
}
