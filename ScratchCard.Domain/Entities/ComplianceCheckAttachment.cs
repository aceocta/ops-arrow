using ScratchCard.Domain.Common;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Domain.Entities;

public class ComplianceCheckAttachment : AuditableEntity
{
    public Guid ComplianceCheckEntryId { get; set; }
    public ComplianceCheckFrequency Frequency { get; set; } = ComplianceCheckFrequency.Daily;
    public Guid ShopId { get; set; }
    public string OriginalFileName { get; set; } = string.Empty;
    public string StoredFileName { get; set; } = string.Empty;
    public string StoredPath { get; set; } = string.Empty;
    public string? ContentType { get; set; }
    public long FileSizeBytes { get; set; }

    public Shop Shop { get; set; } = null!;
}
