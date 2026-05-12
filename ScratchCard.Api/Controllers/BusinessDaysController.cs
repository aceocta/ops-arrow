using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.BusinessDays;
using ScratchCard.Domain.Constants;

namespace ScratchCard.Api.Controllers;

[Route("api/business-days")]
[Authorize(Roles = $"{RoleNames.ShopOwner},{RoleNames.Manager},{RoleNames.Cashier}")]
public class BusinessDaysController : BaseApiController
{
    private readonly IBusinessDayService _businessDayService;

    public BusinessDaysController(IBusinessDayService businessDayService)
    {
        _businessDayService = businessDayService;
    }

    [HttpPost("open")]
    [Authorize(Roles = $"{RoleNames.ShopOwner},{RoleNames.Manager}")]
    public async Task<IActionResult> Open([FromBody] OpenBusinessDayRequest request, CancellationToken cancellationToken)
    {
        var result = await _businessDayService.OpenAsync(request, cancellationToken);
        return Success(result);
    }

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] Guid shopId, [FromQuery] DateOnly? from, [FromQuery] DateOnly? to, CancellationToken cancellationToken)
    {
        var result = await _businessDayService.ListAsync(shopId, from, to, cancellationToken);
        return Success(result);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken cancellationToken)
    {
        var result = await _businessDayService.GetAsync(id, cancellationToken);
        return Success(result);
    }

    [HttpPost("{id:guid}/close")]
    [Authorize(Roles = $"{RoleNames.ShopOwner},{RoleNames.Manager}")]
    public async Task<IActionResult> Close(Guid id, [FromBody] CloseBusinessDayRequest request, CancellationToken cancellationToken)
    {
        var result = await _businessDayService.CloseAsync(id, request, cancellationToken);
        return Success(result);
    }

    [HttpPost("{id:guid}/reopen")]
    [Authorize(Roles = $"{RoleNames.ShopOwner},{RoleNames.Manager}")]
    public async Task<IActionResult> Reopen(Guid id, [FromBody] ReopenBusinessDayRequest request, CancellationToken cancellationToken)
    {
        var result = await _businessDayService.ReopenAsync(id, request, cancellationToken);
        return Success(result);
    }
}
