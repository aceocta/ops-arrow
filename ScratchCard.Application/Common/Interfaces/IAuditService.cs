namespace ScratchCard.Application.Common.Interfaces;

public interface IAuditService
{
    Task LogAsync(
        string entityName,
        Guid? entityId,
        string actionType,
        Guid? shopId = null,
        string? oldValue = null,
        string? newValue = null,
        string? reason = null,
        CancellationToken cancellationToken = default);
}
