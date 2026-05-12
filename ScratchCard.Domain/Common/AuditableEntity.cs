namespace ScratchCard.Domain.Common;

public abstract class AuditableEntity : BaseEntity
{
    public DateTimeOffset CreatedOn { get; set; } = DateTimeOffset.UtcNow;
    public Guid? CreatedBy { get; set; }
    public DateTimeOffset? ModifiedOn { get; set; }
    public Guid? ModifiedBy { get; set; }
}
