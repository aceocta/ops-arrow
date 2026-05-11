namespace ScratchCard.Infrastructure.Services;

public class EmailOptions
{
    public string Provider { get; set; } = "Smtp";
    public string SmtpHost { get; set; } = string.Empty;
    public int SmtpPort { get; set; } = 587;
    public string SmtpUser { get; set; } = string.Empty;
    public string SmtpPassword { get; set; } = string.Empty;
    public bool EnableSsl { get; set; } = true;
    public string FromAddress { get; set; } = "no-reply@scratchcard.local";
    public string FromName { get; set; } = "Scratch Card";
    public string BrevoApiKey { get; set; } = string.Empty;
    public string BrevoBaseUrl { get; set; } = "https://api.brevo.com";
}
