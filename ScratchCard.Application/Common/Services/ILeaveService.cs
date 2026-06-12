using ScratchCard.Application.DTOs.Rota;

namespace ScratchCard.Application.Common.Services;

public interface ILeaveService
{
    // Requests. Create handles both staff self-requests (Pending) and manager record-on-behalf (Approved).
    Task<LeaveRequestDto> CreateAsync(CreateLeaveRequest request, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<LeaveRequestDto>> GetForShopAsync(Guid shopId, DateOnly from, DateOnly to, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<LeaveRequestDto>> GetMineAsync(Guid shopId, CancellationToken cancellationToken = default);
    Task<LeaveRequestDto> ApproveAsync(Guid leaveRequestId, ApproveLeaveRequest request, CancellationToken cancellationToken = default);
    Task<LeaveRequestDto> RejectAsync(Guid leaveRequestId, RejectLeaveRequest request, CancellationToken cancellationToken = default);
    Task<LeaveRequestDto> CancelAsync(Guid leaveRequestId, CancellationToken cancellationToken = default);

    // Entitlements / balance.
    Task<LeaveBalanceDto?> GetBalanceAsync(Guid shopId, Guid? userId, Guid? rotaStaffMemberId, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<LeaveEntitlementDto>> GetEntitlementsAsync(Guid shopId, CancellationToken cancellationToken = default);
    Task<LeaveEntitlementDto> UpsertEntitlementAsync(UpsertLeaveEntitlementRequest request, CancellationToken cancellationToken = default);

    // Approved leave expanded per day (fetched alongside timesheet sessions).
    Task<IReadOnlyCollection<LeaveDayDto>> GetDaysAsync(Guid shopId, Guid? userId, Guid? rotaStaffMemberId, DateOnly from, DateOnly to, CancellationToken cancellationToken = default);
}
