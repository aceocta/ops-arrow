using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Rota;
using ScratchCard.Domain.Constants;

namespace ScratchCard.Api.Controllers;

// Staff shift rota + attendance. Per-shop role checks are enforced inside RotaService
// (management endpoints require CompanyOwner/Manager; staff endpoints allow operational roles).
[Route("api/rota")]
[Authorize(Roles = RoleNames.AllAuthenticated)]
public class RotaController : BaseApiController
{
    private readonly IRotaService _rotaService;

    public RotaController(IRotaService rotaService)
    {
        _rotaService = rotaService;
    }

    // --- Management ---

    [HttpGet]
    public async Task<IActionResult> GetRota([FromQuery] Guid shopId, [FromQuery] DateOnly from, [FromQuery] DateOnly to, CancellationToken cancellationToken)
        => Success(await _rotaService.GetRotaAsync(shopId, from, to, cancellationToken));

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateRotaShiftRequest request, CancellationToken cancellationToken)
        => Success(await _rotaService.CreateShiftAsync(request, cancellationToken));

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateRotaShiftRequest request, CancellationToken cancellationToken)
        => Success(await _rotaService.UpdateShiftAsync(id, request, cancellationToken));

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        await _rotaService.DeleteShiftAsync(id, cancellationToken);
        return Success(true, "Shift deleted.");
    }

    [HttpGet("assignable")]
    public async Task<IActionResult> GetAssignable([FromQuery] Guid shopId, CancellationToken cancellationToken)
        => Success(await _rotaService.GetAssignableUsersAsync(shopId, cancellationToken));

    [HttpGet("shift-templates")]
    public async Task<IActionResult> GetShiftTemplates([FromQuery] Guid shopId, CancellationToken cancellationToken)
        => Success(await _rotaService.GetShiftTemplatesAsync(shopId, cancellationToken));

    [HttpGet("timesheet")]
    public async Task<IActionResult> GetTimesheet([FromQuery] Guid shopId, [FromQuery] DateOnly from, [FromQuery] DateOnly to, CancellationToken cancellationToken)
        => Success(await _rotaService.GetTimesheetAsync(shopId, from, to, cancellationToken));

    [HttpGet("timesheet/by-shift")]
    public async Task<IActionResult> GetShiftTimesheet([FromQuery] Guid shopId, [FromQuery] DateOnly from, [FromQuery] DateOnly to, CancellationToken cancellationToken)
        => Success(await _rotaService.GetShiftTimesheetAsync(shopId, from, to, cancellationToken));

    [HttpGet("timesheet/staff")]
    public async Task<IActionResult> GetStaffSessions([FromQuery] Guid shopId, [FromQuery] Guid userId, [FromQuery] DateOnly from, [FromQuery] DateOnly to, CancellationToken cancellationToken)
        => Success(await _rotaService.GetStaffSessionsAsync(shopId, userId, from, to, cancellationToken));

    [HttpGet("timesheet/by-shift/sessions")]
    public async Task<IActionResult> GetShiftSessions([FromQuery] Guid shopId, [FromQuery] string shiftName, [FromQuery] DateOnly from, [FromQuery] DateOnly to, CancellationToken cancellationToken)
        => Success(await _rotaService.GetShiftSessionsAsync(shopId, shiftName, from, to, cancellationToken));

    // --- Staff ---

    [HttpGet("day-staff")]
    public async Task<IActionResult> GetDayStaff([FromQuery] Guid shopId, [FromQuery] DateOnly date, CancellationToken cancellationToken)
        => Success(await _rotaService.GetBusinessDayStaffAsync(shopId, date, cancellationToken));

    [HttpGet("mine")]
    public async Task<IActionResult> GetMine([FromQuery] Guid shopId, [FromQuery] DateOnly from, [FromQuery] DateOnly to, CancellationToken cancellationToken)
        => Success(await _rotaService.GetMyShiftsAsync(shopId, from, to, cancellationToken));

    [HttpGet("attendance/current")]
    public async Task<IActionResult> GetCurrentAttendance([FromQuery] Guid shopId, CancellationToken cancellationToken)
        => Success(await _rotaService.GetMyCurrentAttendanceAsync(shopId, cancellationToken));

    [HttpPost("attendance/check-in")]
    public async Task<IActionResult> CheckIn([FromQuery] Guid shopId, [FromQuery] Guid? rotaShiftId, CancellationToken cancellationToken)
        => Success(await _rotaService.CheckInAsync(shopId, rotaShiftId, cancellationToken));

    [HttpPost("attendance/check-out")]
    public async Task<IActionResult> CheckOut([FromQuery] Guid shopId, CancellationToken cancellationToken)
        => Success(await _rotaService.CheckOutAsync(shopId, cancellationToken));

    [HttpPost("attendance/manual")]
    public async Task<IActionResult> SaveManualAttendance([FromBody] ManualAttendanceRequest request, CancellationToken cancellationToken)
        => Success(await _rotaService.SaveManualAttendanceAsync(request, cancellationToken));

    // --- Management: attendance approvals ---

    [HttpGet("attendance/pending")]
    public async Task<IActionResult> GetPendingApprovals([FromQuery] Guid shopId, CancellationToken cancellationToken)
        => Success(await _rotaService.GetPendingApprovalsAsync(shopId, cancellationToken));

    [HttpPost("attendance/{id:guid}/approve")]
    public async Task<IActionResult> ApproveAttendance(Guid id, CancellationToken cancellationToken)
        => Success(await _rotaService.ApproveAttendanceAsync(id, cancellationToken));

    [HttpPut("attendance/{id:guid}")]
    public async Task<IActionResult> UpdateAttendance(Guid id, [FromBody] UpdateAttendanceRequest request, CancellationToken cancellationToken)
        => Success(await _rotaService.UpdateAttendanceAsync(id, request, cancellationToken));

    [HttpDelete("attendance/{id:guid}")]
    public async Task<IActionResult> RejectAttendance(Guid id, CancellationToken cancellationToken)
    {
        await _rotaService.RejectAttendanceAsync(id, cancellationToken);
        return Success(true, "Attendance entry rejected.");
    }
}
