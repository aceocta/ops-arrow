using ScratchCard.Domain.Common;

namespace ScratchCard.Domain.Entities;

/// <summary>
/// Freezes a shop's attendance up to and including <see cref="LockedThrough"/> once wages for that
/// period have been paid, so payroll data can't silently drift. One row per shop (the lock only
/// ever moves forward or back); clearing the lock removes the row.
/// </summary>
public class RotaTimesheetLock : AuditableEntity
{
    public Guid ShopId { get; set; }
    public DateOnly LockedThrough { get; set; }
    public Guid LockedByUserId { get; set; }
    public DateTimeOffset LockedOn { get; set; }
    public string? Notes { get; set; }

    public Shop Shop { get; set; } = null!;
    public User LockedByUser { get; set; } = null!;
}
