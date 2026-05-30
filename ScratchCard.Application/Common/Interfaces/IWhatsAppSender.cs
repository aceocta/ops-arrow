namespace ScratchCard.Application.Common.Interfaces;

/// <summary>
/// Sends a transactional WhatsApp message via the configured provider (Meta Cloud API in production).
/// Implementations must accept phone numbers in any common UK format and normalise to E.164 (without
/// the leading +) before contacting the provider, since Meta rejects unnormalised numbers.
/// </summary>
public interface IWhatsAppSender
{
    /// <param name="recipientPhone">Recipient phone number (UK national, international with +, or E.164).</param>
    /// <param name="messageBody">The plain-text message body. Will be rendered into the configured
    /// pre-approved template's {{1}} parameter when running against the live Meta API.</param>
    Task SendAsync(string recipientPhone, string messageBody, CancellationToken cancellationToken = default);
}
