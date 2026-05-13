using ScratchCard.Domain.Common;

namespace ScratchCard.Domain.Entities;

public class ShiftCloseAttachment : AuditableEntity
{
    public Guid ShiftReconciliationId { get; set; }
    public Guid ShopId { get; set; }
    public string OriginalFileName { get; set; } = string.Empty;
    public string StoredFileName { get; set; } = string.Empty;
    public string StoredPath { get; set; } = string.Empty;
    public string? ContentType { get; set; }
    public long FileSizeBytes { get; set; }

    public ShiftReconciliation ShiftReconciliation { get; set; } = null!;
    public Shop Shop { get; set; } = null!;
}
