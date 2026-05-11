using Microsoft.Extensions.Logging;
using ScratchCard.Application.Common.Interfaces;

namespace ScratchCard.Infrastructure.Services;

public class NoopSmsSender : ISmsSender
{
    private readonly ILogger<NoopSmsSender> _logger;

    public NoopSmsSender(ILogger<NoopSmsSender> logger)
    {
        _logger = logger;
    }

    public Task SendAsync(string recipient, string message, CancellationToken cancellationToken = default)
    {
        _logger.LogInformation("SMS provider not configured. SMS to {Recipient} queued as no-op.", recipient);
        return Task.CompletedTask;
    }
}
