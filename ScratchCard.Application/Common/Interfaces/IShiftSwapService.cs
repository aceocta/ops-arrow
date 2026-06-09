using ScratchCard.Application.DTOs.Rota;

namespace ScratchCard.Application.Common.Interfaces;

/// <summary>Shift swap / give-away. Auto-completes on peer accept; external staff are
/// manager-mediated; managers are notified. Growth+ (staff_rota.shift_swap).</summary>
public interface IShiftSwapService
{
    Task<IReadOnlyCollection<ShiftSwapRequestDto>> ListAsync(Guid shopId, CancellationToken cancellationToken = default);
    Task<ShiftSwapRequestDto> CreateAsync(CreateShiftSwapRequest request, CancellationToken cancellationToken = default);
    Task<ShiftSwapRequestDto> RespondAsync(Guid id, bool accept, CancellationToken cancellationToken = default);
    Task<ShiftSwapRequestDto> CancelAsync(Guid id, CancellationToken cancellationToken = default);
}
