using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Models;

namespace ScratchCard.Infrastructure.Services;

public class ConfiguredEmailSender : IEmailSender
{
    private readonly EmailOptions _options;
    private readonly SmtpEmailSender _smtpEmailSender;
    private readonly BrevoEmailSender _brevoEmailSender;
    private readonly ILogger<ConfiguredEmailSender> _logger;

    public ConfiguredEmailSender(
        IOptions<EmailOptions> options,
        SmtpEmailSender smtpEmailSender,
        BrevoEmailSender brevoEmailSender,
        ILogger<ConfiguredEmailSender> logger)
    {
        _options = options.Value;
        _smtpEmailSender = smtpEmailSender;
        _brevoEmailSender = brevoEmailSender;
        _logger = logger;
    }

    public Task SendAsync(string recipient, string subject, string body, CancellationToken cancellationToken = default)
        => ResolveSender().SendAsync(recipient, subject, body, cancellationToken);

    public Task SendAsync(EmailMessage message, CancellationToken cancellationToken = default)
        => ResolveSender().SendAsync(message, cancellationToken);

    private IEmailSender ResolveSender()
    {
        if (string.Equals(_options.Provider, "Brevo", StringComparison.OrdinalIgnoreCase))
        {
            return _brevoEmailSender;
        }

        if (!string.IsNullOrWhiteSpace(_options.Provider) &&
            !string.Equals(_options.Provider, "Smtp", StringComparison.OrdinalIgnoreCase))
        {
            _logger.LogWarning("Unknown email provider '{Provider}'. Falling back to SMTP.", _options.Provider);
        }

        return _smtpEmailSender;
    }
}
