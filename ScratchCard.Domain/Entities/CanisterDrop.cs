using ScratchCard.Domain.Common;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Domain.Entities;

public class CanisterDrop : AuditableEntity
{
    public Guid ShopId { get; set; }
    public Guid BusinessDayId { get; set; }
    public Guid ShiftId { get; set; }
    public Guid CanisterId { get; set; }
    public decimal Amount { get; set; }
    public Guid? DroppedByUserId { get; set; }
    public string DroppedByName { get; set; } = string.Empty;
    public DateTimeOffset DroppedOn { get; set; }

    // Manager-approval workflow. On plans without safe_drop.approval_workflow, drops are
    // auto-approved on creation. On Pro, drops sit in Pending until a manager approves.
    public ApprovalStatus ApprovalStatus { get; set; } = ApprovalStatus.Approved;
    public Guid? ApprovedByUserId { get; set; }
    public DateTimeOffset? ApprovedOn { get; set; }
    public string? ApprovalNotes { get; set; }

    public Shop Shop { get; set; } = null!;
    public BusinessDay BusinessDay { get; set; } = null!;
    public Shift Shift { get; set; } = null!;
    public Canister Canister { get; set; } = null!;
}
