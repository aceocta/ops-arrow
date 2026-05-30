using ScratchCard.Domain.Common;

namespace ScratchCard.Domain.Entities;

/// <summary>
/// A single visitor / contractor sign-in (and later sign-out) at a shop. This is the digital
/// replacement for the paper visitor book: it doubles as the fire-evacuation roll call (anyone
/// with no <see cref="TimeOut"/> is still on site).
/// </summary>
public class VisitorLogEntry : AuditableEntity
{
    public Guid ShopId { get; set; }

    // Link back to the reusable directory record (null if it could not be resolved/created).
    public Guid? VisitorId { get; set; }

    // Per shop/day running number, shown as the register row number.
    public int SequenceNo { get; set; }

    public DateOnly VisitDate { get; set; }
    public TimeOnly TimeIn { get; set; }
    public TimeOnly? TimeOut { get; set; }

    // Snapshot of the visitor details at the time of the visit (kept independent of the
    // directory record so history is stable even if the directory entry is later edited).
    public string VisitorName { get; set; } = string.Empty;
    public string? Organisation { get; set; }

    // One of the VisitorVisitType values.
    public string VisitType { get; set; } = string.Empty;

    // Reason / work being carried out, host staff member, vehicle reg.
    public string? Purpose { get; set; }
    public string? HostName { get; set; }
    public string? VehicleRegistration { get; set; }

    // True when VisitType is Inspector — drives the manager alert.
    public bool IsInspector { get; set; }

    // Signature is required at sign-in; photo and notes are optional.
    public string? SignatureImagePath { get; set; }
    public string? PhotoImagePath { get; set; }
    public string? Notes { get; set; }

    // Forecourt-only contractor controls (captured only when the shop IsFuelStation).
    public string? SpaPassportRef { get; set; }
    public string? PermitToWorkRef { get; set; }
    public bool InductionAcknowledged { get; set; }

    public DateTimeOffset RecordedOn { get; set; }
    public Guid? RecordedByUserId { get; set; }
    public string? RecordedByName { get; set; }

    public Shop Shop { get; set; } = null!;
    public Visitor? Visitor { get; set; }
}
