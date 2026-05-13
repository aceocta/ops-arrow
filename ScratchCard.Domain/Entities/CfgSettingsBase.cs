using ScratchCard.Domain.Common;

namespace ScratchCard.Domain.Entities;

public abstract class CfgSettingsBase : AuditableEntity
{
    public Guid? ShopId { get; set; }
    public bool IsActive { get; set; } = true;

    public Shop? Shop { get; set; }
}
