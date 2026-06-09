using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Domain.Constants;

namespace ScratchCard.Api.Controllers;

// Phase 4: accounting export — correctly-classified journal (VAT + agency rules).
[Route("api/till-accounting")]
[Authorize(Roles = RoleNames.ManagementAndAbove)]
public class TillAccountingController : BaseApiController
{
    private readonly ITillAccountingService _service;

    public TillAccountingController(ITillAccountingService service)
    {
        _service = service;
    }

    [HttpGet("summary")]
    public async Task<IActionResult> Summary([FromQuery] Guid shopId, [FromQuery] DateOnly from, [FromQuery] DateOnly to, CancellationToken cancellationToken)
        => Success(await _service.GetSummaryAsync(shopId, from, to, cancellationToken));

    [HttpGet("export.csv")]
    public async Task<IActionResult> ExportCsv([FromQuery] Guid shopId, [FromQuery] DateOnly from, [FromQuery] DateOnly to, CancellationToken cancellationToken)
    {
        var bytes = await _service.ExportCsvAsync(shopId, from, to, cancellationToken);
        return File(bytes, "text/csv", $"till-journal_{from:yyyy-MM-dd}_{to:yyyy-MM-dd}.csv");
    }
}
