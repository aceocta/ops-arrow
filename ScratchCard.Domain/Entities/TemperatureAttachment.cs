using ScratchCard.Domain.Common;

namespace ScratchCard.Domain.Entities;

/// <summary>
/// A photo attached to a temperature reading OR an equipment issue (spec §10 / §15 / §20). Same
/// metadata-only shape as <c>ShiftCloseAttachment</c> — the file itself lives in blob storage via
/// <c>IAttachmentStorageService</c>; only the pointer + metadata are persisted. Exactly one of
/// <see cref="TemperatureReadingId"/> / <see cref="TemperatureEquipmentIssueId"/> is set per row.
/// </summary>
public class TemperatureAttachment : AuditableEntity
{
    public Guid ShopId { get; set; }
    public Guid? TemperatureReadingId { get; set; }
    public Guid? TemperatureEquipmentIssueId { get; set; }

    public string OriginalFileName { get; set; } = string.Empty;
    public string StoredFileName { get; set; } = string.Empty;
    public string StoredPath { get; set; } = string.Empty;
    public string? ContentType { get; set; }
    public long FileSizeBytes { get; set; }

    public Shop Shop { get; set; } = null!;
    public TemperatureReading? TemperatureReading { get; set; }
    public TemperatureEquipmentIssue? TemperatureEquipmentIssue { get; set; }
}
