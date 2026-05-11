namespace ScratchCard.Application.Common.Interfaces;

public interface IEmailSender
{
    Task SendAsync(string recipient, string subject, string body, CancellationToken cancellationToken = default);
    Task SendAsync(Common.Models.EmailMessage message, CancellationToken cancellationToken = default);
}
