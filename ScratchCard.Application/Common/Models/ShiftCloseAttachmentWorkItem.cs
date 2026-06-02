using ScratchCard.Application.DTOs.Common;

namespace ScratchCard.Application.Common.Models;

/// <summary>
/// Work item for uploading shift-close attachments off the request thread. The shift close itself
/// is persisted synchronously; the (potentially slow) blob uploads + row writes are processed in
/// the background so the close call returns quickly.
/// </summary>
public sealed class ShiftCloseAttachmentWorkItem
{
    public Guid ShiftReconciliationId { get; init; }
    public Guid ShopId { get; init; }
    public DateOnly BusinessDate { get; init; }
    public string ShiftName { get; init; } = string.Empty;
    public Guid? CreatedByUserId { get; init; }
    public IReadOnlyCollection<CloseAttachmentUploadRequest> Attachments { get; init; } = [];
    public string? LegacyAttachmentFileName { get; init; }
    public string? LegacyAttachmentBase64 { get; init; }
    public string? LegacyAttachmentContentType { get; init; }
}
