using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Application.Common.Services;
using ScratchCard.Domain.Constants;

namespace ScratchCard.Api.Controllers;

/// <summary>
/// PlatformAdmin-only platform-wide shops list (across all customers). Backs the admin web
/// Shops navigation.
/// </summary>
[Route("api/admin/shops")]
[Authorize(Roles = RoleNames.PlatformAdmin)]
public class AdminShopsController : BaseApiController
{
    private readonly IAdminCustomerService _adminCustomerService;

    public AdminShopsController(IAdminCustomerService adminCustomerService)
    {
        _adminCustomerService = adminCustomerService;
    }

    /// <summary>Paged, searchable list of all shops. ?search= matches shop name or company name.</summary>
    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] string? search,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken cancellationToken = default)
    {
        var result = await _adminCustomerService.ListShopsAsync(search, page, pageSize, cancellationToken);
        return Success(result);
    }
}
