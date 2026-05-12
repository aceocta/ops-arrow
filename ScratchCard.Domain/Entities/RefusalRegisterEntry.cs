using ScratchCard.Domain.Common;

namespace ScratchCard.Domain.Entities;

public class RefusalRegisterEntry : AuditableEntity
{
    public Guid ShopId { get; set; }
    public int SequenceNo { get; set; }
    public DateOnly RefusalDate { get; set; }
    public TimeOnly RefusalTime { get; set; }
    public string Product { get; set; } = string.Empty;
    public string PersonDescription { get; set; } = string.Empty;
    public string? Observations { get; set; }
    public string StaffMemberInitials { get; set; } = string.Empty;
    public string? SignatureImagePath { get; set; }
    public DateTimeOffset RecordedOn { get; set; }
    public Guid? RecordedByUserId { get; set; }
    public string? RecordedByName { get; set; }
    public DateTimeOffset? ReviewedOn { get; set; }
    public Guid? ReviewedByUserId { get; set; }
    public string? ReviewedByName { get; set; }
    public string? ReviewNotes { get; set; }
    public string? ReviewSignatureImagePath { get; set; }

    public Shop Shop { get; set; } = null!;
}
