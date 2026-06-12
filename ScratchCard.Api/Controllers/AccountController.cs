using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Users;

namespace ScratchCard.Api.Controllers;

/// <summary>
/// Self-service "my account" endpoints. Deliberately separate from <see cref="UsersController"/>,
/// whose class-level role/shop gates (ManagementAndAbove + RequireShopRole) must not apply here:
/// every signed-in user, regardless of role, can manage their own account.
/// </summary>
[Route("api/users/me")]
[Authorize]
public class AccountController : BaseApiController
{
    private readonly IUserService _userService;

    public AccountController(IUserService userService)
    {
        _userService = userService;
    }

    /// <summary>
    /// Permanently deletes (anonymises) the caller's own account. App Store Guideline 5.1.1(v) /
    /// Google Play account-deletion compliance. Requires typing DELETE; password accounts must
    /// also supply their current password. Irreversible.
    /// </summary>
    [HttpPost("delete-account")]
    public async Task<IActionResult> DeleteAccount([FromBody] DeleteMyAccountRequest request, CancellationToken cancellationToken)
    {
        await _userService.DeleteMyAccountAsync(request, cancellationToken);
        return Success(new { Deleted = true }, "Account deleted.");
    }
}
