using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Api.Authorization;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.BusinessDays;
using ScratchCard.Domain.Constants;

namespace ScratchCard.Api.Controllers;

[Route("api/business-days")]
[Authorize(Roles = RoleNames.OperationalRoles)]
public class BusinessDaysController : BaseApiController
{
    private readonly IBusinessDayService _businessDayService;

    public BusinessDaysController(IBusinessDayService businessDayService)
    {
        _businessDayService = businessDayService;
    }

    [HttpPost("open")]
    [RequireShopRole(RoleNames.CompanyOwner, RoleNames.Manager, RoleNames.Cashier, RoleNames.SalesAssistant)]
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

    [HttpGet("{id:guid}/safe-drop/canisters")]
    public async Task<IActionResult> ListCanisters(Guid id, CancellationToken cancellationToken)
    {
        var result = await _businessDayService.ListCanistersAsync(id, cancellationToken);
        return Success(result);
    }

    [HttpGet("{id:guid}/safe-drop/canister-drops")]
    public async Task<IActionResult> ListCanisterDrops(Guid id, CancellationToken cancellationToken)
    {
        var result = await _businessDayService.ListCanisterDropsAsync(id, cancellationToken);
        return Success(result);
    }

    [HttpPost("{id:guid}/safe-drop/canister-drops")]
    public async Task<IActionResult> AddCanisterDrop(Guid id, [FromBody] CreateCanisterDropRequest request, CancellationToken cancellationToken)
    {
        var result = await _businessDayService.AddCanisterDropAsync(id, request, cancellationToken);
        return Success(result);
    }

    // Pro-only: approve a pending canister drop. The service enforces the feature gate; this
    // route just exposes it. The 'id' route param is the businessDayId for path consistency,
    // but routing here uses the drop id directly.
    [HttpPost("safe-drop/canister-drops/{canisterDropId:guid}/approve")]
    [Authorize(Roles = RoleNames.OwnerAndManager)]
    public async Task<IActionResult> ApproveCanisterDrop(Guid canisterDropId, [FromBody] ApproveCanisterDropRequest request, CancellationToken cancellationToken)
    {
        var result = await _businessDayService.ApproveCanisterDropAsync(canisterDropId, request?.Notes, cancellationToken);
        return Success(result);
    }

    [HttpPost("{id:guid}/close")]
    public async Task<IActionResult> Close(Guid id, [FromBody] CloseBusinessDayRequest request, CancellationToken cancellationToken)
    {
        var result = await _businessDayService.CloseAsync(id, request, cancellationToken);
        return Success(result);
    }

    [HttpPost("{id:guid}/reopen")]
    [Authorize(Roles = RoleNames.OwnerAndManager)]
    public async Task<IActionResult> Reopen(Guid id, [FromBody] ReopenBusinessDayRequest request, CancellationToken cancellationToken)
    {
        var result = await _businessDayService.ReopenAsync(id, request, cancellationToken);
        return Success(result);
    }

    [HttpGet("attachments/{attachmentId:guid}/content")]
    public async Task<IActionResult> GetCloseAttachmentContent(Guid attachmentId, CancellationToken cancellationToken)
    {
        var result = await _businessDayService.GetCloseAttachmentDataUrlAsync(attachmentId, cancellationToken);
        return Success(result);
    }
}

