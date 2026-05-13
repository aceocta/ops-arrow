using ScratchCard.Domain.Common;

namespace ScratchCard.Domain.Entities;

public class BusinessDayCloseAttachment : AuditableEntity
{
    public Guid BusinessDayId { get; set; }
    public Guid ShopId { get; set; }
    public string OriginalFileName { get; set; } = string.Empty;
    public string StoredFileName { get; set; } = string.Empty;
    public string StoredPath { get; set; } = string.Empty;
    public string? ContentType { get; set; }
    public long FileSizeBytes { get; set; }

    public BusinessDay BusinessDay { get; set; } = null!;
    public Shop Shop { get; set; } = null!;
}
