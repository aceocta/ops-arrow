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
    [Authorize(Roles = RoleNames.OwnerAndPlatform)]
    public async Task<IActionResult> Create([FromBody] CreateShopRequest request, CancellationToken cancellationToken)
    {
        var result = await _shopService.CreateAsync(request, cancellationToken);
        return Success(result);
    }

    [HttpPut("{id:guid}")]
    [Authorize(Roles = RoleNames.ManagementAndAbove)]
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

    /// <summary>
    /// Returns the per-shop feature-module toggles. Each module is independent; disabling one
    /// does not block another. Whatever the shop's plan does not include is also reported.
    /// </summary>
    [HttpGet("{id:guid}/feature-toggles")]
    [Authorize(Roles = RoleNames.OwnerAndManager)]
    public async Task<IActionResult> GetFeatureToggles(Guid id, CancellationToken cancellationToken)
    {
        var result = await _shopService.GetFeatureTogglesAsync(id, cancellationToken);
        return Success(result);
    }

    /// <summary>
    /// Replaces the per-shop disabled-feature list. Unknown / non-module keys are silently
    /// dropped. CompanyOwner + Manager only — Cashier / SalesAssistant cannot toggle features.
    /// </summary>
    [HttpPut("{id:guid}/feature-toggles")]
    [Authorize(Roles = RoleNames.OwnerAndManager)]
    public async Task<IActionResult> UpdateFeatureToggles(Guid id, [FromBody] UpdateShopFeatureTogglesRequest request, CancellationToken cancellationToken)
    {
        var result = await _shopService.UpdateFeatureTogglesAsync(id, request, cancellationToken);
        return Success(result);
    }
}

