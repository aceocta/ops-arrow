using ScratchCard.Domain.Common;

namespace ScratchCard.Domain.Entities;

/// <summary>
/// A reusable visitor / contractor directory record, scoped to a company. When a visitor is
/// signed in on any of the company's shops we look one up (or create it) so the next visit can
/// auto-fill name, organisation and default visit type. Customers are never recorded here.
/// </summary>
public class Visitor : AuditableEntity
{
    // Null when the shop has no parent company — the record is then effectively a loose
    // (company-less) directory bucket. Indexed for the auto-fill lookup.
    public Guid? CompanyId { get; set; }

    public string FullName { get; set; } = string.Empty;
    public string? Organisation { get; set; }
    public string? Phone { get; set; }

    // One of the VisitorVisitType values (Delivery / Contractor / Rep / Inspector / Other).
    public string? DefaultVisitType { get; set; }

    public int VisitCount { get; set; }
    public DateTimeOffset? LastVisitedOn { get; set; }

    public ICollection<VisitorLogEntry> Entries { get; set; } = new List<VisitorLogEntry>();
}
