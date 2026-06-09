using ScratchCard.Application.DTOs.StoreSales;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.Common.Interfaces;

/// <summary>Phase 1 till reconciliation: capture canonical lines, count cash, compute over/short,
/// record a variance reason and sign off.</summary>
public interface ITillReconciliationService
{
    Task<TillReconciliationDto> GetOrCreateAsync(GetOrCreateReconciliationRequest request, CancellationToken cancellationToken = default);
    Task<TillReconciliationDto> GetAsync(Guid id, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<TillReconciliationDto>> ListAsync(Guid shopId, DateOnly from, DateOnly to, CancellationToken cancellationToken = default);

    Task<TillReconciliationDto> SaveLineAsync(SaveReconciliationLineRequest request, CancellationToken cancellationToken = default);
    Task<TillReconciliationDto> DeleteLineAsync(Guid lineId, CancellationToken cancellationToken = default);

    Task<TillReconciliationDto> SetCashCountAsync(SetCashCountRequest request, CancellationToken cancellationToken = default);
    Task<TillReconciliationDto> SetVarianceReasonAsync(SetVarianceReasonRequest request, CancellationToken cancellationToken = default);
    Task<TillReconciliationDto> SetStatusAsync(Guid id, TillReconciliationStatus status, CancellationToken cancellationToken = default);
}
