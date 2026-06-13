using ScratchCard.Application.DTOs.StoreSales;

namespace ScratchCard.Application.Common.Interfaces;

/// <summary>A shop's own custom till fields (line items) with simple in/out/none cash behaviour. Owner/manager only.</summary>
public interface ITillShopFieldService
{
    Task<IReadOnlyCollection<TillShopFieldDto>> ListAsync(Guid shopId, CancellationToken cancellationToken = default);
    Task<TillShopFieldDto> CreateAsync(CreateTillShopFieldRequest request, CancellationToken cancellationToken = default);
    Task<TillShopFieldDto> UpdateAsync(UpdateTillShopFieldRequest request, CancellationToken cancellationToken = default);
    Task DeleteAsync(Guid id, CancellationToken cancellationToken = default);
}
