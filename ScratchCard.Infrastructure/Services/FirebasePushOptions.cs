namespace ScratchCard.Infrastructure.Services;

public class FirebasePushOptions
{
    public bool Enabled { get; set; } = true;
    public string ProjectId { get; set; } = string.Empty;
    public string? ServiceAccountJson { get; set; }
    public string? ServiceAccountFilePath { get; set; }
}
