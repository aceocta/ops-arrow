using ScratchCard.Domain.Common;

namespace ScratchCard.Domain.Entities;

/// <summary>
/// An effective-dated hourly pay rate for a staff member at a shop. The rate applied to a shift is
/// the row with the latest <see cref="EffectiveFrom"/> on or before that shift's date — so a raise
/// never rewrites historical wage cost. Targets either a registered <see cref="User"/> or a
/// roster-only <see cref="RotaStaffMember"/> (exactly one).
/// </summary>
public class StaffPayRate : SoftDeletableAuditableEntity
{
    public Guid ShopId { get; set; }
    public Guid? UserId { get; set; }
    public Guid? RotaStaffMemberId { get; set; }

    public decimal HourlyRate { get; set; }
    public DateOnly EffectiveFrom { get; set; }
    public string? Notes { get; set; }

    public Shop Shop { get; set; } = null!;
    public User? User { get; set; }
    public RotaStaffMember? RotaStaffMember { get; set; }
}
