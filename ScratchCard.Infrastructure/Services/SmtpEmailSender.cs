using System.Net;
using System.Net.Mail;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Models;

namespace ScratchCard.Infrastructure.Services;

public class SmtpEmailSender : IEmailSender
{
    private readonly EmailOptions _options;
    private readonly ILogger<SmtpEmailSender> _logger;

    public SmtpEmailSender(IOptions<EmailOptions> options, ILogger<SmtpEmailSender> logger)
    {
        _options = options.Value;
        _logger = logger;
    }

    public async Task SendAsync(string recipient, string subject, string body, CancellationToken cancellationToken = default)
    {
        await SendAsync(new EmailMessage
        {
            Recipient = recipient,
            Subject = subject,
            Body = body,
            IsBodyHtml = false
        }, cancellationToken);
    }

    public async Task SendAsync(EmailMessage message, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(_options.SmtpHost))
        {
            _logger.LogWarning("SMTP host is not configured. Email to {Recipient} was skipped.", message.Recipient);
            return;
        }

        using var client = new SmtpClient(_options.SmtpHost, _options.SmtpPort)
        {
            EnableSsl = _options.EnableSsl,
            Credentials = new NetworkCredential(_options.SmtpUser, _options.SmtpPassword)
        };

        using var mailMessage = new MailMessage(_options.FromAddress, message.Recipient, message.Subject, message.Body)
        {
            IsBodyHtml = message.IsBodyHtml
        };

        foreach (var attachment in message.Attachments)
        {
            if (attachment.Content.Length == 0 || string.IsNullOrWhiteSpace(attachment.FileName))
            {
                continue;
            }

            var stream = new MemoryStream(attachment.Content);
            var mailAttachment = new Attachment(stream, attachment.FileName, attachment.ContentType);
            mailMessage.Attachments.Add(mailAttachment);
        }

        using var registration = cancellationToken.Register(() => client.SendAsyncCancel());
        await client.SendMailAsync(mailMessage, cancellationToken);
    }
}
