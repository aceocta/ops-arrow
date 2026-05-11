using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Domain.Entities;

namespace ScratchCard.Infrastructure.Services;

public class AuditService : IAuditService
{
    private readonly IRepository<AuditLog> _auditRepository;
    private readonly ICurrentUserService _currentUserService;
    private readonly IUnitOfWork _unitOfWork;

    public AuditService(
        IRepository<AuditLog> auditRepository,
        ICurrentUserService currentUserService,
        IUnitOfWork unitOfWork)
    {
        _auditRepository = auditRepository;
        _currentUserService = currentUserService;
        _unitOfWork = unitOfWork;
    }

    public async Task LogAsync(
        string entityName,
        Guid? entityId,
        string actionType,
        Guid? shopId = null,
        string? oldValue = null,
        string? newValue = null,
        string? reason = null,
        CancellationToken cancellationToken = default)
    {
        var entry = new AuditLog
        {
            ShopId = shopId,
            EntityName = entityName,
            EntityId = entityId,
            ActionType = actionType,
            OldValue = oldValue,
            NewValue = newValue,
            ChangedByUserId = _currentUserService.UserId,
            ChangedOn = DateTimeOffset.UtcNow,
            Reason = reason,
            IpAddress = _currentUserService.IpAddress
        };

        await _auditRepository.AddAsync(entry, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
    }
}
