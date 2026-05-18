using ScratchCard.Domain.Common;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Domain.Entities;

public class ComplianceCheckItem : AuditableEntity
{
    public Guid ShopId { get; set; }
    public Guid ComplianceCheckGroupId { get; set; }
    public ComplianceCheckFrequency Frequency { get; set; } = ComplianceCheckFrequency.Daily;
    public string ItemName { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int DisplayOrder { get; set; }
    public bool IsRequired { get; set; } = true;
    public bool IsActive { get; set; } = true;
    public bool IsSystemDefault { get; set; }
    public bool IsDeleted { get; set; }

    public Shop Shop { get; set; } = null!;
    public ComplianceCheckGroup ComplianceCheckGroup { get; set; } = null!;
    public ICollection<ComplianceCheckEntry> Entries { get; set; } = new List<ComplianceCheckEntry>();
}
