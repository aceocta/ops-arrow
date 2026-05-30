using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Domain.Entities;

namespace ScratchCard.Infrastructure.Services;

public sealed class AuditLogBackgroundService : BackgroundService
{
    private readonly AuditLogBackgroundQueue _queue;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<AuditLogBackgroundService> _logger;

    public AuditLogBackgroundService(
        AuditLogBackgroundQueue queue,
        IServiceScopeFactory scopeFactory,
        ILogger<AuditLogBackgroundService> logger)
    {
        _queue = queue;
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var job in _queue.ReadAllAsync(stoppingToken))
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var repository = scope.ServiceProvider.GetRequiredService<IRepository<AuditLog>>();
                var unitOfWork = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();

                await repository.AddAsync(new AuditLog
                {
                    ShopId = job.ShopId,
                    EntityName = job.EntityName,
                    EntityId = job.EntityId,
                    ActionType = job.ActionType,
                    OldValue = job.OldValue,
                    NewValue = job.NewValue,
                    ChangedByUserId = job.ChangedByUserId,
                    ChangedOn = job.ChangedOn,
                    Reason = job.Reason,
                    IpAddress = job.IpAddress
                }, stoppingToken);
                await unitOfWork.SaveChangesAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(
                    ex,
                    "Failed to persist audit log entry: {ActionType} on {EntityName} ({EntityId}).",
                    job.ActionType, job.EntityName, job.EntityId);
            }
        }
    }
}
