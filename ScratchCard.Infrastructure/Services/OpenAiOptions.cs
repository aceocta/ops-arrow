namespace ScratchCard.Infrastructure.Services;

public class OpenAiOptions
{
    public string ApiKey { get; set; } = string.Empty;
    public string Model { get; set; } = "gpt-4.1-mini";
    public string BaseUrl { get; set; } = "https://api.openai.com";
    public int TimeoutSeconds { get; set; } = 90;
}
