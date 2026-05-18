using ScratchCard.Domain.Common;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Domain.Entities;

public class ComplianceCheckGroup : AuditableEntity
{
    public Guid ShopId { get; set; }
    public ComplianceCheckFrequency Frequency { get; set; } = ComplianceCheckFrequency.Daily;
    public string GroupName { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int DisplayOrder { get; set; }
    public bool IsActive { get; set; } = true;
    public bool IsSystemDefault { get; set; }
    public bool IsDeleted { get; set; }

    public Shop Shop { get; set; } = null!;
    public ICollection<ComplianceCheckItem> Items { get; set; } = new List<ComplianceCheckItem>();
}
