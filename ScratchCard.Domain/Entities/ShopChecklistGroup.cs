using ScratchCard.Domain.Common;

namespace ScratchCard.Domain.Entities;

public class ShopChecklistGroup : AuditableEntity
{
    public Guid ShopId { get; set; }
    public string GroupName { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int DisplayOrder { get; set; }
    public bool IsActive { get; set; } = true;
    public bool IsSystemDefault { get; set; }
    public bool IsDeleted { get; set; }

    public Shop Shop { get; set; } = null!;
    public ICollection<ShopChecklistTask> Tasks { get; set; } = new List<ShopChecklistTask>();
}

