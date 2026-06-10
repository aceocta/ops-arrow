using ScratchCard.Application.DTOs.StoreSales;

namespace ScratchCard.Application.Common.Interfaces;

/// <summary>Per-shop overrides of a canonical till field's category / VAT / ledger. Owner/manager only.</summary>
public interface ITillFieldOverrideService
{
    Task<IReadOnlyCollection<TillFieldOverrideDto>> ListAsync(Guid shopId, CancellationToken cancellationToken = default);
    Task<TillFieldOverrideDto> UpsertAsync(UpsertTillFieldOverrideRequest request, CancellationToken cancellationToken = default);
    Task DeleteAsync(Guid id, CancellationToken cancellationToken = default);

    /// <summary>Copy field overrides (and optionally counter config) from one shop to others in the
    /// same company. Returns the number of target shops updated.</summary>
    Task<int> CopyToShopsAsync(CopyTillConfigRequest request, CancellationToken cancellationToken = default);
}
