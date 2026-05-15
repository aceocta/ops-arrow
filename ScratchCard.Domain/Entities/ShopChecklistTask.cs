using ScratchCard.Domain.Common;

namespace ScratchCard.Domain.Entities;

public class ShopChecklistTask : AuditableEntity
{
    public Guid ShopId { get; set; }
    public Guid ChecklistGroupId { get; set; }
    public string TaskName { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int DisplayOrder { get; set; }
    public bool IsRequired { get; set; } = true;
    public bool IsActive { get; set; } = true;
    public bool NotesRequiredOnComplete { get; set; }
    public bool RequiredForShopOpen { get; set; }
    public bool RequiredForShiftClose { get; set; }
    public bool RequiredForDayClose { get; set; }
    public bool IsSystemDefault { get; set; }
    public bool IsDeleted { get; set; }

    public Shop Shop { get; set; } = null!;
    public ShopChecklistGroup ChecklistGroup { get; set; } = null!;
}

