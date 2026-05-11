namespace ScratchCard.Domain.Common;

public abstract class SoftDeletableAuditableEntity : AuditableEntity
{
    public bool IsDeleted { get; set; }
}
