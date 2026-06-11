using ScratchCard.Domain.Common;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Domain.Entities;

/// <summary>
/// A staff member's sign-off of their worked hours for a pay period. A manager requests reviews for
/// a period; each registered user with hours gets a row they must confirm (or dispute). Once every
/// row is manager-approved the period can be locked via <see cref="RotaTimesheetLock"/> and exported.
/// External (roster-only) staff are manager-recorded, so they are excluded from this workflow.
/// </summary>
public class RotaTimesheetReview : AuditableEntity
{
    public Guid ShopId { get; set; }
    public DateOnly PeriodFrom { get; set; }
    public DateOnly PeriodTo { get; set; }
    public Guid UserId { get; set; }
    public RotaTimesheetReviewStatus Status { get; set; } = RotaTimesheetReviewStatus.PendingStaff;
    // The staff member's dispute text (why their hours look wrong).
    public string? StaffNote { get; set; }
    // The manager's resolution / rejection note.
    public string? ManagerNote { get; set; }
    public DateTimeOffset? ConfirmedOn { get; set; }
    public Guid? ResolvedByUserId { get; set; }
    public DateTimeOffset? ResolvedOn { get; set; }

    public Shop Shop { get; set; } = null!;
    public User User { get; set; } = null!;
    public User? ResolvedByUser { get; set; }
}
