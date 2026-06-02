using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ScratchCard.Application.Common.Services;

namespace ScratchCard.Infrastructure.Services;

public sealed class ShiftCloseAttachmentBackgroundService : BackgroundService
{
    private readonly ShiftCloseAttachmentBackgroundQueue _queue;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<ShiftCloseAttachmentBackgroundService> _logger;

    public ShiftCloseAttachmentBackgroundService(
        ShiftCloseAttachmentBackgroundQueue queue,
        IServiceScopeFactory scopeFactory,
        ILogger<ShiftCloseAttachmentBackgroundService> logger)
    {
        _queue = queue;
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var workItem in _queue.ReadAllAsync(stoppingToken))
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var shiftSalesService = scope.ServiceProvider.GetRequiredService<IShiftSalesService>();
                await shiftSalesService.ProcessCloseAttachmentsAsync(workItem, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(
                    ex,
                    "Background shift close attachment processing failed for reconciliation {ReconciliationId}",
                    workItem.ShiftReconciliationId);
            }
        }
    }
}
