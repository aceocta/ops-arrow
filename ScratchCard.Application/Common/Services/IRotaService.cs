using ScratchCard.Application.DTOs.Rota;

namespace ScratchCard.Application.Common.Services;

public interface IRotaService
{
    // Management (CompanyOwner / Manager)
    Task<IReadOnlyCollection<RotaShiftDto>> GetRotaAsync(Guid shopId, DateOnly from, DateOnly to, CancellationToken cancellationToken = default);
    Task<RotaShiftDto> CreateShiftAsync(CreateRotaShiftRequest request, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<RotaShiftDto>> GenerateWeekAsync(Guid shopId, DateOnly weekStart, CancellationToken cancellationToken = default);
    Task<RotaShiftDto> UpdateShiftAsync(Guid shiftId, UpdateRotaShiftRequest request, CancellationToken cancellationToken = default);
    Task DeleteShiftAsync(Guid shiftId, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<AssignableUserDto>> GetAssignableUsersAsync(Guid shopId, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<RotaShiftTemplateDto>> GetShiftTemplatesAsync(Guid shopId, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<TimesheetRowDto>> GetTimesheetAsync(Guid shopId, DateOnly from, DateOnly to, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<ShiftTimesheetRowDto>> GetShiftTimesheetAsync(Guid shopId, DateOnly from, DateOnly to, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<TimesheetSessionDto>> GetStaffSessionsAsync(Guid shopId, Guid userId, DateOnly from, DateOnly to, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<ShiftSessionDto>> GetShiftSessionsAsync(Guid shopId, string shiftName, DateOnly from, DateOnly to, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<AttendanceApprovalRowDto>> GetPendingApprovalsAsync(Guid shopId, CancellationToken cancellationToken = default);
    Task<ShiftAttendanceDto> ApproveAttendanceAsync(Guid attendanceId, CancellationToken cancellationToken = default);
    Task<ShiftAttendanceDto> UpdateAttendanceAsync(Guid attendanceId, UpdateAttendanceRequest request, CancellationToken cancellationToken = default);
    Task RejectAttendanceAsync(Guid attendanceId, CancellationToken cancellationToken = default);

    // Staff (operational roles)
    Task<BusinessDayStaffDto> GetBusinessDayStaffAsync(Guid shopId, DateOnly date, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<RotaShiftDto>> GetMyShiftsAsync(Guid shopId, DateOnly from, DateOnly to, CancellationToken cancellationToken = default);
    Task<ShiftAttendanceDto?> GetMyCurrentAttendanceAsync(Guid shopId, CancellationToken cancellationToken = default);
    Task<ShiftAttendanceDto> CheckInAsync(Guid shopId, Guid? rotaShiftId, CancellationToken cancellationToken = default);
    Task<ShiftAttendanceDto> CheckOutAsync(Guid shopId, CancellationToken cancellationToken = default);
    Task<ShiftAttendanceDto> SaveManualAttendanceAsync(ManualAttendanceRequest request, CancellationToken cancellationToken = default);
}
