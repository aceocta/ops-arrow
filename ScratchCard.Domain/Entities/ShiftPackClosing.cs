using ScratchCard.Domain.Common;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Domain.Entities;

/// <summary>
/// A per-pack closing serial captured for an open shift, ahead of finalisation. Acts as the
/// staging store so closing numbers can be entered (and re-entered) on their own screen during
/// the day; shift finalize reads these rows rather than receiving an entries payload. One row
/// per (ShiftId, PackId).
/// </summary>
public class ShiftPackClosing : BaseEntity
{
    public Guid ShiftId { get; set; }
    public Guid ShopId { get; set; }
    public Guid PackId { get; set; }
    public string ClosingSerialNumber { get; set; } = string.Empty;
    public string? OriginalScannedSerialNumber { get; set; }
    public EntryMethod EntryMethod { get; set; }
    public string? ManualEntryReason { get; set; }
    public string? Notes { get; set; }
    public Guid? EnteredByUserId { get; set; }
    public DateTimeOffset EnteredOn { get; set; }
    public DateTimeOffset? ModifiedOn { get; set; }
    public Guid? ModifiedBy { get; set; }

    public Shift Shift { get; set; } = null!;
    public ScratchCardPack Pack { get; set; } = null!;
    public Shop Shop { get; set; } = null!;
}
