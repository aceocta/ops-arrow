using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ScratchCard.Application.Common.Services;

namespace ScratchCard.Infrastructure.Services;

public sealed class DayCloseAttachmentBackgroundService : BackgroundService
{
    private readonly DayCloseAttachmentBackgroundQueue _queue;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<DayCloseAttachmentBackgroundService> _logger;

    public DayCloseAttachmentBackgroundService(
        DayCloseAttachmentBackgroundQueue queue,
        IServiceScopeFactory scopeFactory,
        ILogger<DayCloseAttachmentBackgroundService> logger)
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
                var businessDayService = scope.ServiceProvider.GetRequiredService<IBusinessDayService>();
                await businessDayService.ProcessDayCloseAttachmentsAsync(workItem, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(
                    ex,
                    "Background day close attachment processing failed for business day {BusinessDayId}",
                    workItem.BusinessDayId);
            }
        }
    }
}
