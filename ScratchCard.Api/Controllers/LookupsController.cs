using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Application.Common.Services;
using ScratchCard.Domain.Constants;

namespace ScratchCard.Api.Controllers;

[Route("api/lookups")]
[Authorize(Roles = $"{RoleNames.ShopOwner},{RoleNames.Manager}")]
public class LookupsController : BaseApiController
{
    private readonly ILookupService _lookupService;

    public LookupsController(ILookupService lookupService)
    {
        _lookupService = lookupService;
    }

    [HttpGet("roles")]
    public async Task<IActionResult> Roles(CancellationToken cancellationToken)
    {
        var roles = await _lookupService.GetRolesAsync(cancellationToken);
        return Success(roles);
    }
}
