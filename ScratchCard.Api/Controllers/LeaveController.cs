using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Rota;
using ScratchCard.Domain.Constants;

namespace ScratchCard.Api.Controllers;

// Leave management (holiday / sick / unpaid / other). Per-shop role checks and the
// LeaveManagement feature gate are enforced inside LeaveService (management endpoints require
// CompanyOwner/Manager; staff endpoints allow operational roles).
[Route("api/rota/leave")]
[Authorize(Roles = RoleNames.AllAuthenticated)]
public class LeaveController : BaseApiController
{
    private readonly ILeaveService _leaveService;

    public LeaveController(ILeaveService leaveService)
    {
        _leaveService = leaveService;
    }

    // Staff create their own request (Pending); a manager passing userId/rotaStaffMemberId
    // records leave on that person's behalf (created Approved).
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateLeaveRequest request, CancellationToken cancellationToken)
        => Success(await _leaveService.CreateAsync(request, cancellationToken));

    // --- Management ---

    [HttpGet]
    public async Task<IActionResult> GetForShop([FromQuery] Guid shopId, [FromQuery] DateOnly from, [FromQuery] DateOnly to, CancellationToken cancellationToken)
        => Success(await _leaveService.GetForShopAsync(shopId, from, to, cancellationToken));

    [HttpPost("{id:guid}/approve")]
    public async Task<IActionResult> Approve(Guid id, [FromBody] ApproveLeaveRequest request, CancellationToken cancellationToken)
        => Success(await _leaveService.ApproveAsync(id, request, cancellationToken));

    [HttpPost("{id:guid}/reject")]
    public async Task<IActionResult> Reject(Guid id, [FromBody] RejectLeaveRequest request, CancellationToken cancellationToken)
        => Success(await _leaveService.RejectAsync(id, request, cancellationToken));

    [HttpGet("entitlements")]
    public async Task<IActionResult> GetEntitlements([FromQuery] Guid shopId, CancellationToken cancellationToken)
        => Success(await _leaveService.GetEntitlementsAsync(shopId, cancellationToken));

    [HttpPut("entitlements")]
    public async Task<IActionResult> UpsertEntitlement([FromBody] UpsertLeaveEntitlementRequest request, CancellationToken cancellationToken)
        => Success(await _leaveService.UpsertEntitlementAsync(request, cancellationToken));

    // --- Staff (own) / management (anyone) ---

    [HttpGet("mine")]
    public async Task<IActionResult> GetMine([FromQuery] Guid shopId, CancellationToken cancellationToken)
        => Success(await _leaveService.GetMineAsync(shopId, cancellationToken));

    // Staff may cancel their own pending request; cancelling approved leave (or someone
    // else's request) requires a manager.
    [HttpPost("{id:guid}/cancel")]
    public async Task<IActionResult> Cancel(Guid id, CancellationToken cancellationToken)
        => Success(await _leaveService.CancelAsync(id, cancellationToken));

    [HttpGet("balance")]
    public async Task<IActionResult> GetBalance([FromQuery] Guid shopId, [FromQuery] Guid? userId, [FromQuery] Guid? rotaStaffMemberId, CancellationToken cancellationToken)
        => Success(await _leaveService.GetBalanceAsync(shopId, userId, rotaStaffMemberId, cancellationToken));

    // Approved leave expanded per calendar day — clients fetch this alongside timesheet sessions.
    [HttpGet("days")]
    public async Task<IActionResult> GetDays([FromQuery] Guid shopId, [FromQuery] Guid? userId, [FromQuery] Guid? rotaStaffMemberId, [FromQuery] DateOnly from, [FromQuery] DateOnly to, CancellationToken cancellationToken)
        => Success(await _leaveService.GetDaysAsync(shopId, userId, rotaStaffMemberId, from, to, cancellationToken));
}
