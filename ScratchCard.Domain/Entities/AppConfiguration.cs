using ScratchCard.Domain.Common;

namespace ScratchCard.Domain.Entities;

public class AppConfiguration : AuditableEntity
{
    public Guid? ShopId { get; set; }
    public string ConfigKey { get; set; } = string.Empty;
    public string ConfigValue { get; set; } = string.Empty;
    public string DataType { get; set; } = "string";
    public string? Description { get; set; }
    public string GroupName { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;

    public Shop? Shop { get; set; }
}
