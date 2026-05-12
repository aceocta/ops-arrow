using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Users;
using ScratchCard.Domain.Constants;

namespace ScratchCard.Api.Controllers;

[Route("api/users")]
[Authorize(Roles = RoleNames.ShopOwner)]
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
