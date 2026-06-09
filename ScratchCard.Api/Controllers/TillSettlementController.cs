using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.DTOs.StoreSales;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Api.Controllers;

// Phase 3: Post Office separate balance + provider settlement reconciliation.
[Route("api/till-settlement")]
[Authorize(Roles = RoleNames.ManagementAndAbove)]
public class TillSettlementController : BaseApiController
{
    private readonly ITillSettlementService _service;

    public TillSettlementController(ITillSettlementService service)
    {
        _service = service;
    }

    // ---- Post Office ----

    [HttpPost("post-office")]
    public async Task<IActionResult> GetOrCreatePostOffice([FromBody] GetOrCreatePostOfficeRequest request, CancellationToken cancellationToken)
        => Success(await _service.GetOrCreatePostOfficeAsync(request, cancellationToken));

    [HttpPost("post-office/save")]
    public async Task<IActionResult> SavePostOffice([FromBody] SavePostOfficeRequest request, CancellationToken cancellationToken)
        => Success(await _service.SavePostOfficeAsync(request, cancellationToken));

    [HttpPost("post-office/{id:guid}/status")]
    public async Task<IActionResult> SetPostOfficeStatus(Guid id, [FromQuery] TillReconciliationStatus status, CancellationToken cancellationToken)
        => Success(await _service.SetPostOfficeStatusAsync(id, status, cancellationToken));

    // ---- Provider settlement ----

    [HttpPost("provider")]
    public async Task<IActionResult> GetOrCreateSettlement([FromBody] GetOrCreateSettlementRequest request, CancellationToken cancellationToken)
        => Success(await _service.GetOrCreateSettlementAsync(request, cancellationToken));

    [HttpPost("provider/{id:guid}/refresh")]
    public async Task<IActionResult> RefreshCaptured(Guid id, CancellationToken cancellationToken)
        => Success(await _service.RefreshCapturedAsync(id, cancellationToken));

    [HttpPost("provider/statement")]
    public async Task<IActionResult> SetStatement([FromBody] SetStatementRequest request, CancellationToken cancellationToken)
        => Success(await _service.SetStatementAsync(request, cancellationToken));

    [HttpPost("provider/{id:guid}/status")]
    public async Task<IActionResult> SetSettlementStatus(Guid id, [FromQuery] SettlementStatus status, CancellationToken cancellationToken)
        => Success(await _service.SetSettlementStatusAsync(id, status, cancellationToken));

    [HttpGet("provider")]
    public async Task<IActionResult> ListSettlements([FromQuery] Guid shopId, [FromQuery] DateOnly from, [FromQuery] DateOnly to, CancellationToken cancellationToken)
        => Success(await _service.ListSettlementsAsync(shopId, from, to, cancellationToken));
}
