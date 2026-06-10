using ScratchCard.Application.DTOs.StoreSales;

namespace ScratchCard.Application.Common.Interfaces;

/// <summary>Global, data-driven canonical till-field catalogue. Platform-admin only.</summary>
public interface ITillFieldDefinitionService
{
    Task<IReadOnlyCollection<TillFieldDefinitionDto>> ListAsync(CancellationToken cancellationToken = default);
    /// <summary>Active fields only, for line-editor pickers (any authenticated user).</summary>
    Task<IReadOnlyCollection<TillFieldDefinitionDto>> ListActiveAsync(CancellationToken cancellationToken = default);
    Task<TillFieldDefinitionDto> CreateAsync(CreateTillFieldDefinitionRequest request, CancellationToken cancellationToken = default);
    Task<TillFieldDefinitionDto> UpdateAsync(UpdateTillFieldDefinitionRequest request, CancellationToken cancellationToken = default);
    Task ReloadAsync(CancellationToken cancellationToken = default);

    Task<IReadOnlyCollection<TillFieldAliasDto>> ListAliasesAsync(CancellationToken cancellationToken = default);
    Task<TillFieldAliasDto> AddAliasAsync(AddTillFieldAliasRequest request, CancellationToken cancellationToken = default);
    Task DeleteAliasAsync(Guid id, CancellationToken cancellationToken = default);
}
