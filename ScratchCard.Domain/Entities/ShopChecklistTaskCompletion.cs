using ScratchCard.Domain.Common;

namespace ScratchCard.Domain.Entities;

public class ShopChecklistTaskCompletion : AuditableEntity
{
    public Guid ShopId { get; set; }
    public Guid? CompanyId { get; set; }
    public DateOnly BusinessDate { get; set; }
    public Guid? ShiftId { get; set; }
    public Guid ChecklistGroupId { get; set; }
    public Guid ChecklistTaskId { get; set; }
    public bool IsCompleted { get; set; }
    public Guid? CompletedByUserId { get; set; }
    public string? CompletedByName { get; set; }
    public DateTimeOffset? CompletedOn { get; set; }
    public string? Notes { get; set; }

    public Shop Shop { get; set; } = null!;
    public ShopChecklistGroup ChecklistGroup { get; set; } = null!;
    public ShopChecklistTask ChecklistTask { get; set; } = null!;
    public Shift? Shift { get; set; }
}

