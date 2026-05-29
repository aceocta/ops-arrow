using ScratchCard.Domain.Common;

namespace ScratchCard.Domain.Entities;

public class TillReportAttachment : BaseEntity
{
    public Guid TillReportId { get; set; }
    public int PageNumber { get; set; }
    public string StoredPath { get; set; } = string.Empty;
    public string OriginalFileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;

    public TillReport TillReport { get; set; } = null!;
}
