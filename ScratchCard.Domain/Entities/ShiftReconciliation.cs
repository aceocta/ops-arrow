using ScratchCard.Domain.Common;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Domain.Entities;

public class ShiftReconciliation : BaseEntity
{
    public Guid ShiftId { get; set; }
    public Guid ShopId { get; set; }
    public decimal TotalSalesAmount { get; set; }
    public decimal TotalPrizePayout { get; set; }
    public decimal ExpectedCash { get; set; }
    public decimal ActualCash { get; set; }
    public decimal Difference { get; set; }
    public ReconciliationStatus Status { get; set; } = ReconciliationStatus.Submitted;
    public Guid SubmittedByUserId { get; set; }
    public DateTimeOffset SubmittedOn { get; set; }
    public Guid? ApprovedByUserId { get; set; }
    public DateTimeOffset? ApprovedOn { get; set; }
    public string? Notes { get; set; }

    public Shift Shift { get; set; } = null!;
    public Shop Shop { get; set; } = null!;
    public ICollection<ShiftCloseAttachment> Attachments { get; set; } = new List<ShiftCloseAttachment>();
}
