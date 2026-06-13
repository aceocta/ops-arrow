using ScratchCard.Application.DTOs.StoreSales;

namespace ScratchCard.Application.Common.Interfaces;

/// <summary>Per-shop custom reconciliation groups (sections) plus the global built-ins. Owner/manager only.</summary>
public interface ITillGroupDefinitionService
{
    /// <summary>Built-in groups + the shop's own custom groups, ordered by sort.</summary>
    Task<IReadOnlyCollection<TillGroupDto>> ListAsync(Guid shopId, CancellationToken cancellationToken = default);
    Task<TillGroupDto> CreateAsync(CreateTillGroupRequest request, CancellationToken cancellationToken = default);
    Task<TillGroupDto> UpdateAsync(UpdateTillGroupRequest request, CancellationToken cancellationToken = default);
    /// <summary>Soft-deletes a custom group and reverts any fields assigned to it back to their default group.</summary>
    Task DeleteAsync(Guid id, CancellationToken cancellationToken = default);
}
