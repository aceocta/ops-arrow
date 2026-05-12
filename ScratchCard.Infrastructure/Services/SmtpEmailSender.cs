using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MimeKit;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Models;
using System.Net.Mail;

namespace ScratchCard.Infrastructure.Services;

public class SmtpEmailSender : IEmailSender
{
    private readonly EmailOptions _options;
    private readonly ILogger<SmtpEmailSender> _logger;

    public SmtpEmailSender(
        IOptions<EmailOptions> options,
        ILogger<SmtpEmailSender> logger)
    {
        _options = options.Value;
        _logger = logger;
    }

    public async Task SendAsync(
        string recipient,
        string subject,
        string body,
        CancellationToken cancellationToken = default)
    {
        await SendAsync(new EmailMessage
        {
            Recipient = recipient,
            Subject = subject,
            Body = body,
            IsBodyHtml = false
        }, cancellationToken);
    }

    public async Task SendAsync(
        EmailMessage message,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(_options.SmtpHost))
        {
            _logger.LogWarning(
                "SMTP host is not configured. Email to {Recipient} was skipped.",
                message.Recipient);

            return;
        }

        if (string.IsNullOrWhiteSpace(_options.SmtpUser) ||
            string.IsNullOrWhiteSpace(_options.SmtpPassword))
        {
            _logger.LogWarning(
                "SMTP username or password is not configured. Email to {Recipient} was skipped.",
                message.Recipient);

            return;
        }

        try
        {
            var email = new MimeMessage();

            email.From.Add(new MailboxAddress(
                _options.FromName ?? "OpsArrow",
                _options.FromAddress));

            email.To.Add(MailboxAddress.Parse(message.Recipient));

            email.Subject = message.Subject;

            var bodyBuilder = new BodyBuilder();

            if (message.IsBodyHtml)
            {
                bodyBuilder.HtmlBody = message.Body;
            }
            else
            {
                bodyBuilder.TextBody = message.Body;
            }

            foreach (var attachment in message.Attachments)
            {
                if (attachment.Content.Length == 0 ||
                    string.IsNullOrWhiteSpace(attachment.FileName))
                {
                    continue;
                }

                bodyBuilder.Attachments.Add(
                    attachment.FileName,
                    attachment.Content,
                    ContentType.Parse(attachment.ContentType));
            }

            email.Body = bodyBuilder.ToMessageBody();

            using var client = new MailKit.Net.Smtp.SmtpClient();

            client.ServerCertificateValidationCallback = (sender, certificate, chain, errors) => true;

            var socketOption = GetSecureSocketOption();

            _logger.LogInformation(
                "Connecting to SMTP server {Host}:{Port} using {SocketOption}",
                _options.SmtpHost,
                _options.SmtpPort,
                socketOption);

            await client.ConnectAsync(
                _options.SmtpHost,
                _options.SmtpPort,
                socketOption,
                cancellationToken);

            await client.AuthenticateAsync(
                _options.SmtpUser,
                _options.SmtpPassword,
                cancellationToken);

            await client.SendAsync(email, cancellationToken);

            await client.DisconnectAsync(true, cancellationToken);

            _logger.LogInformation(
                "Email sent successfully to {Recipient}",
                message.Recipient);
        }
        catch (Exception ex)
        {
            _logger.LogError(
                ex,
                "Failed to send email to {Recipient}. SMTP Host: {Host}, Port: {Port}",
                message.Recipient,
                _options.SmtpHost,
                _options.SmtpPort);

            throw;
        }
    }

    private SecureSocketOptions GetSecureSocketOption()
    {
        return _options.SmtpPort switch
        {
            465 => SecureSocketOptions.SslOnConnect,
            587 => SecureSocketOptions.StartTls,
            25 => SecureSocketOptions.StartTlsWhenAvailable,
            _ => _options.EnableSsl
                ? SecureSocketOptions.StartTls
                : SecureSocketOptions.Auto
        };
    }
}