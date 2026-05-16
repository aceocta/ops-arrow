using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Invitations;
using ScratchCard.Domain.Constants;

namespace ScratchCard.Api.Controllers;

[Route("api/invitations")]
public class InvitationsController : BaseApiController
{
    private readonly IInvitationService _invitationService;

    public InvitationsController(IInvitationService invitationService)
    {
        _invitationService = invitationService;
    }

    [HttpPost]
    [Authorize(Roles = $"{RoleNames.PlatformAdmin},{RoleNames.ShopOwner},{RoleNames.Manager}")]
    public async Task<IActionResult> Send([FromBody] CreateInvitationRequest request, CancellationToken cancellationToken)
    {
        var invitation = await _invitationService.SendInvitationAsync(request, cancellationToken);
        return Success(invitation);
    }

    [HttpGet("validate")]
    [AllowAnonymous]
    public async Task<IActionResult> Validate([FromQuery] string token, CancellationToken cancellationToken)
    {
        var result = await _invitationService.ValidateInvitationAsync(token, cancellationToken);
        return Success(result);
    }

    [HttpPost("accept")]
    [AllowAnonymous]
    public async Task<IActionResult> Accept([FromBody] AcceptInvitationRequest request, CancellationToken cancellationToken)
    {
        var result = await _invitationService.AcceptInvitationAsync(request, cancellationToken);
        return Success(result);
    }

    [HttpPost("{invitationId:guid}/resend")]
    [Authorize(Roles = RoleNames.ShopOwner)]
    public async Task<IActionResult> Resend(Guid invitationId, CancellationToken cancellationToken)
    {
        var invitation = await _invitationService.ResendInvitationAsync(invitationId, cancellationToken);
        return Success(invitation);
    }

    [HttpDelete("{invitationId:guid}")]
    [Authorize(Roles = RoleNames.ShopOwner)]
    public async Task<IActionResult> Cancel(Guid invitationId, CancellationToken cancellationToken)
    {
        await _invitationService.CancelInvitationAsync(invitationId, cancellationToken);
        return Success(new { Cancelled = true });
    }

    [HttpGet]
    [Authorize(Roles = $"{RoleNames.PlatformAdmin},{RoleNames.ShopOwner},{RoleNames.Manager}")]
    public async Task<IActionResult> List([FromQuery] Guid shopId, CancellationToken cancellationToken)
    {
        var invitations = await _invitationService.ListInvitationsAsync(shopId, cancellationToken);
        return Success(invitations);
    }
}
