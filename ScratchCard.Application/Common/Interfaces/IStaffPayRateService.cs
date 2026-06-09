using ScratchCard.Application.DTOs.Rota;

namespace ScratchCard.Application.Common.Interfaces;

/// <summary>Effective-dated staff hourly rates (labour cost). Manager/owner only, Growth+ feature.</summary>
public interface IStaffPayRateService
{
    Task<IReadOnlyCollection<StaffPayRateDto>> ListAsync(Guid shopId, CancellationToken cancellationToken = default);
    Task<StaffPayRateDto> SetAsync(SetStaffPayRateRequest request, CancellationToken cancellationToken = default);
    Task DeleteAsync(Guid id, CancellationToken cancellationToken = default);
}
