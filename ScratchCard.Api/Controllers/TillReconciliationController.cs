using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.DTOs.StoreSales;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Api.Controllers;

// Phase 1 till reconciliation: capture canonical lines, count cash, compute over/short, sign off.
[Route("api/till-reconciliation")]
[Authorize(Roles = RoleNames.AllAuthenticated)]
public class TillReconciliationController : BaseApiController
{
    private readonly ITillReconciliationService _service;

    public TillReconciliationController(ITillReconciliationService service)
    {
        _service = service;
    }

    [HttpPost]
    public async Task<IActionResult> GetOrCreate([FromBody] GetOrCreateReconciliationRequest request, CancellationToken cancellationToken)
        => Success(await _service.GetOrCreateAsync(request, cancellationToken));

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken cancellationToken)
        => Success(await _service.GetAsync(id, cancellationToken));

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] Guid shopId, [FromQuery] DateOnly from, [FromQuery] DateOnly to, CancellationToken cancellationToken)
        => Success(await _service.ListAsync(shopId, from, to, cancellationToken));

    [HttpPost("lines")]
    public async Task<IActionResult> SaveLine([FromBody] SaveReconciliationLineRequest request, CancellationToken cancellationToken)
        => Success(await _service.SaveLineAsync(request, cancellationToken));

    [HttpDelete("lines/{lineId:guid}")]
    public async Task<IActionResult> DeleteLine(Guid lineId, CancellationToken cancellationToken)
        => Success(await _service.DeleteLineAsync(lineId, cancellationToken));

    [HttpPost("cash-count")]
    public async Task<IActionResult> SetCashCount([FromBody] SetCashCountRequest request, CancellationToken cancellationToken)
        => Success(await _service.SetCashCountAsync(request, cancellationToken));

    [HttpPost("variance-reason")]
    public async Task<IActionResult> SetVarianceReason([FromBody] SetVarianceReasonRequest request, CancellationToken cancellationToken)
        => Success(await _service.SetVarianceReasonAsync(request, cancellationToken));

    [HttpPost("{id:guid}/status")]
    public async Task<IActionResult> SetStatus(Guid id, [FromQuery] TillReconciliationStatus status, CancellationToken cancellationToken)
        => Success(await _service.SetStatusAsync(id, status, cancellationToken));
}
