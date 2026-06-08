using ScratchCard.Domain.Common;

namespace ScratchCard.Domain.Entities;

/// <summary>
/// A roster-only staff member who is NOT a registered Ops Arrow user — e.g. a casual or external
/// worker the manager wants to put on the rota and record hours for. Reusable across shifts; can be
/// referenced by <see cref="ShiftAssignment"/> and <see cref="ShiftAttendance"/> instead of a User.
/// </summary>
public class RotaStaffMember : SoftDeletableAuditableEntity
{
    public Guid ShopId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Phone { get; set; } // stored with country code, e.g. +44...
    public string? Email { get; set; }
    public bool IsActive { get; set; } = true;

    public Shop Shop { get; set; } = null!;
}
