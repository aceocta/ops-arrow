using ScratchCard.Application.DTOs.StoreSales;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.Common.Interfaces;

/// <summary>Phase 3: Post Office separate balance + provider settlement reconciliation.</summary>
public interface ITillSettlementService
{
    // Post Office (separate Horizon balance)
    Task<PostOfficeBalanceDto> GetOrCreatePostOfficeAsync(GetOrCreatePostOfficeRequest request, CancellationToken cancellationToken = default);
    Task<PostOfficeBalanceDto> SavePostOfficeAsync(SavePostOfficeRequest request, CancellationToken cancellationToken = default);
    Task<PostOfficeBalanceDto> SetPostOfficeStatusAsync(Guid id, TillReconciliationStatus status, CancellationToken cancellationToken = default);

    // Provider settlement (PayPoint / Payzone / Lottery / Parcels)
    Task<ProviderSettlementDto> GetOrCreateSettlementAsync(GetOrCreateSettlementRequest request, CancellationToken cancellationToken = default);
    Task<ProviderSettlementDto> RefreshCapturedAsync(Guid id, CancellationToken cancellationToken = default);
    Task<ProviderSettlementDto> SetStatementAsync(SetStatementRequest request, CancellationToken cancellationToken = default);
    Task<ProviderSettlementDto> SetSettlementStatusAsync(Guid id, SettlementStatus status, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<ProviderSettlementDto>> ListSettlementsAsync(Guid shopId, DateOnly from, DateOnly to, CancellationToken cancellationToken = default);
}
