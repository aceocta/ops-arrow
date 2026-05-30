using Microsoft.Extensions.Logging;
using ScratchCard.Application.Common.Interfaces;

namespace ScratchCard.Infrastructure.Services;

/// <summary>
/// Fallback registered when Meta WhatsApp credentials aren't configured. Logs the would-be
/// send and returns success, so feature-gated callers don't blow up in dev or in a fresh
/// staging environment without secrets wired up yet.
/// </summary>
public sealed class NoopWhatsAppSender : IWhatsAppSender
{
    private readonly ILogger<NoopWhatsAppSender> _logger;

    public NoopWhatsAppSender(ILogger<NoopWhatsAppSender> logger)
    {
        _logger = logger;
    }

    public Task SendAsync(string recipientPhone, string messageBody, CancellationToken cancellationToken = default)
    {
        _logger.LogInformation(
            "WhatsApp provider not configured. Message to {Phone} ({Length} chars) skipped.",
            recipientPhone, messageBody?.Length ?? 0);
        return Task.CompletedTask;
    }
}
