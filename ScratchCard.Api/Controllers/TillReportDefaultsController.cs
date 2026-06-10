using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Domain.Constants;

namespace ScratchCard.Api.Controllers;

// Seed default Till Report data (payment types + a default till) for an existing shop, or every
// shop in a company. Owner/manager; per-shop role enforced in the service.
[Route("api/till-report-defaults")]
[Authorize(Roles = RoleNames.ManagementAndAbove)]
public class TillReportDefaultsController : BaseApiController
{
    private readonly ITillReportDefaultsService _service;

    public TillReportDefaultsController(ITillReportDefaultsService service)
    {
        _service = service;
    }

    public class ApplyTillReportDefaultsRequest
    {
        public Guid? ShopId { get; set; }
        public Guid? CompanyId { get; set; }
    }

    [HttpPost("apply")]
    public async Task<IActionResult> Apply([FromBody] ApplyTillReportDefaultsRequest request, CancellationToken cancellationToken)
        => Success(new { seeded = await _service.ApplyAsync(request.ShopId, request.CompanyId, cancellationToken) });
}
