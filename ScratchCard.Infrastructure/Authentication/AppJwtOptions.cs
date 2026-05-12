namespace ScratchCard.Infrastructure.Authentication;

public class AppJwtOptions
{
    public string Issuer { get; set; } = "ScratchCard.Api";
    public string Audience { get; set; } = "ScratchCard.Mobile";
    public string Secret { get; set; } = string.Empty;
    public int AccessTokenExpiryMinutes { get; set; } = 480;
}
