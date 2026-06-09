using ScratchCard.Domain.Common;

namespace ScratchCard.Domain.Entities;

/// <summary>A captured source photo behind a reconciliation (EPOS Z-read, lottery slip, etc.).</summary>
public class TillReconciliationAttachment : BaseEntity
{
    public Guid TillReconciliationId { get; set; }
    /// <summary>Storage path/key (routes by prefix: s3://, blob://, file://).</summary>
    public string StoragePath { get; set; } = string.Empty;
    /// <summary>What this source is, e.g. "EPOS Z-read", "Lottery", "PayPoint".</summary>
    public string? SourceLabel { get; set; }
    /// <summary>Raw OCR text (retained locally; not sent to third parties).</summary>
    public string? OcrRawText { get; set; }

    public TillReconciliation Reconciliation { get; set; } = null!;
}
