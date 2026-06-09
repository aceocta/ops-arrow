using ScratchCard.Domain.Common;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Domain.Entities;

/// <summary>
/// A request by an assigned staff member to swap their shift with a peer, or give it away. Completes
/// automatically when the peer accepts (managers are notified, not gating). External (non-app) staff
/// can't accept in-app, so requests targeting them are manager-mediated.
/// </summary>
public class ShiftSwapRequest : AuditableEntity
{
    public Guid ShopId { get; set; }
    public ShiftSwapType Type { get; set; }
    public ShiftSwapStatus Status { get; set; } = ShiftSwapStatus.Pending;

    /// <summary>Initiator — always a registered user (the one giving up <see cref="FromShiftId"/>).</summary>
    public Guid RequesterUserId { get; set; }
    public Guid FromShiftId { get; set; }

    /// <summary>The peer taking the shift — a registered user OR a roster-only member (exactly one).</summary>
    public Guid? TargetUserId { get; set; }
    public Guid? TargetRotaStaffMemberId { get; set; }
    /// <summary>For Swap: the target's shift the requester takes in return. Null for GiveAway.</summary>
    public Guid? ToShiftId { get; set; }

    public string? Note { get; set; }
    public DateTimeOffset? RespondedOn { get; set; }
    public Guid? RespondedByUserId { get; set; }

    public Shop Shop { get; set; } = null!;
    public User Requester { get; set; } = null!;
    public RotaShift FromShift { get; set; } = null!;
}
