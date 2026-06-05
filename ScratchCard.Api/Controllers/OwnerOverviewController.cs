using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Application.Common.Services;
using ScratchCard.Domain.Constants;

namespace ScratchCard.Api.Controllers;

// Multi-shop owner/manager dashboard. No per-shop RequireShopRole here: the service scopes the
// roll-up to the shops the caller actually belongs to.
[Route("api/reports/owner-overview")]
[Authorize(Roles = RoleNames.OwnerAndManager)]
public class OwnerOverviewController : BaseApiController
{
    private readonly IOwnerOverviewService _ownerOverviewService;

    public OwnerOverviewController(IOwnerOverviewService ownerOverviewService)
    {
        _ownerOverviewService = ownerOverviewService;
    }

    [HttpGet]
    public async Task<IActionResult> Get([FromQuery] DateOnly from, [FromQuery] DateOnly to, CancellationToken cancellationToken)
    {
        var result = await _ownerOverviewService.GetAsync(from, to, cancellationToken);
        return Success(result);
    }
}
