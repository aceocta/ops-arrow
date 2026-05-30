using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Api.Authorization;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Users;
using ScratchCard.Domain.Constants;

namespace ScratchCard.Api.Controllers;

[Route("api/users")]
[Authorize(Roles = RoleNames.ManagementAndAbove)]
// Every endpoint on this controller resolves a specific shop via query/body. Class-level
// RequireShopRole closes the per-shop bypass without per-action repetition.
[RequireShopRole(RoleNames.CompanyOwner, RoleNames.Manager)]
public class UsersController : BaseApiController
{
    private readonly IUserService _userService;

    public UsersController(IUserService userService)
    {
        _userService = userService;
    }

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] Guid shopId, CancellationToken cancellationToken)
    {
        var users = await _userService.ListUsersAsync(shopId, cancellationToken);
        return Success(users);
    }

    [HttpPut("{userId:guid}/role")]
    public async Task<IActionResult> UpdateRole(Guid userId, [FromBody] UpdateUserRoleRequest request, CancellationToken cancellationToken)
    {
        await _userService.UpdateRoleAsync(userId, request, cancellationToken);
        return Success(new { Updated = true });
    }

    /// <summary>
    /// Manager-only edit of another user's first/last name and optional phone number. The shopId
    /// query param is required so the RequireShopRole gate (class-level) can scope the caller's
    /// authority correctly, and so an off-shop user can't be edited from this endpoint.
    /// </summary>
    [HttpPut("{userId:guid}/details")]
    public async Task<IActionResult> UpdateDetails(Guid userId, [FromQuery] Guid shopId, [FromBody] UpdateUserProfileRequest request, CancellationToken cancellationToken)
    {
        var updated = await _userService.UpdateUserDetailsAsync(userId, shopId, request, cancellationToken);
        return Success(updated);
    }

    [HttpPost("{userId:guid}/deactivate")]
    public async Task<IActionResult> Deactivate(Guid userId, [FromQuery] Guid shopId, CancellationToken cancellationToken)
    {
        await _userService.SetActiveAsync(userId, shopId, false, cancellationToken);
        return Success(new { Updated = true });
    }

    [HttpPost("{userId:guid}/reactivate")]
    public async Task<IActionResult> Reactivate(Guid userId, [FromQuery] Guid shopId, CancellationToken cancellationToken)
    {
        await _userService.SetActiveAsync(userId, shopId, true, cancellationToken);
        return Success(new { Updated = true });
    }
}

