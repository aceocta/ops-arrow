using ScratchCard.Application.DTOs.Common;

namespace ScratchCard.Application.Common.Models;

/// <summary>
/// Work item for uploading day-close attachments off the request thread. The day close is persisted
/// synchronously; the (potentially slow) blob uploads + row writes run in the background so the
/// close call returns quickly.
/// </summary>
public sealed class DayCloseAttachmentWorkItem
{
    public Guid BusinessDayId { get; init; }
    public Guid ShopId { get; init; }
    public DateOnly BusinessDate { get; init; }
    public Guid? CreatedByUserId { get; init; }
    public IReadOnlyCollection<CloseAttachmentUploadRequest> Attachments { get; init; } = [];
    public string? LegacyAttachmentFileName { get; init; }
    public string? LegacyAttachmentBase64 { get; init; }
    public string? LegacyAttachmentContentType { get; init; }
}
