namespace ScratchCard.Application.DTOs.Common;

public class CloseAttachmentUploadRequest
{
    public string FileName { get; set; } = string.Empty;
    public string Base64 { get; set; } = string.Empty;
    public string? ContentType { get; set; }
}

public class CloseAttachmentDto
{
    public Guid Id { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string? ContentType { get; set; }
    public long FileSizeBytes { get; set; }
    public DateTimeOffset UploadedOn { get; set; }
}
