using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.DTOs.Rota;
using ScratchCard.Domain.Constants;

namespace ScratchCard.Api.Controllers;

// Effective-dated staff hourly rates (labour cost). Manager/owner only; per-shop checks + the
// staff_rota.labour_cost feature gate are enforced in the service.
[Route("api/staff-pay-rates")]
[Authorize(Roles = RoleNames.ManagementAndAbove)]
public class StaffPayRatesController : BaseApiController
{
    private readonly IStaffPayRateService _service;

    public StaffPayRatesController(IStaffPayRateService service)
    {
        _service = service;
    }

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] Guid shopId, CancellationToken cancellationToken)
        => Success(await _service.ListAsync(shopId, cancellationToken));

    [HttpPost]
    public async Task<IActionResult> Set([FromBody] SetStaffPayRateRequest request, CancellationToken cancellationToken)
        => Success(await _service.SetAsync(request, cancellationToken));

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        await _service.DeleteAsync(id, cancellationToken);
        return Success(true);
    }
}
