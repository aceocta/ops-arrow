using ScratchCard.Domain.Common;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Domain.Entities;

/// <summary>
/// A stateful equipment-safety incident for one monitoring unit — the "Not Working → Under Maintenance →
/// Resolved" lifecycle with per-incident manager approval. Opened automatically by a Fail reading or
/// manually via "mark unit not working" (spec §15). Shaped after <c>CoinBagAlert</c> (a real Status
/// column + per-transition timestamp/actor pairs); resolution rules follow spec §20.
/// </summary>
public class TemperatureEquipmentIssue : AuditableEntity
{
    public Guid ShopId { get; set; }
    public Guid TemperatureMonitoringUnitId { get; set; }

    public EquipmentWorkingStatus Status { get; set; } = EquipmentWorkingStatus.NotWorking;
    public string Reason { get; set; } = string.Empty;
    /// <summary>Temperature at the moment the issue opened (null for a manual mark with no reading).</summary>
    public decimal? TemperatureAtOpenCelsius { get; set; }
    /// <summary>True when opened by a failed reading; false for a manual "mark not working".</summary>
    public bool OpenedFromReading { get; set; }

    /// <summary>Dwell-timer anchor — when food first went outside the safe band. Elapsed/remaining vs the
    /// 2-hour (hot) / 4-hour (cold) limit is computed from this, not stored ticking.</summary>
    public DateTimeOffset IssueStartedOn { get; set; } = DateTimeOffset.UtcNow;

    public Guid? OpenedByUserId { get; set; }
    public string? OpenedByName { get; set; }

    // Food handling captured at open (spec §14 / §15).
    public bool? FoodAffected { get; set; }
    public bool? FoodMoved { get; set; }
    public string? FoodMovedTo { get; set; }
    public bool? FoodDiscarded { get; set; }
    public bool? ManagerInformed { get; set; }
    public string? CorrectiveActions { get; set; }

    // Under maintenance.
    public DateTimeOffset? MaintenanceStartedOn { get; set; }
    public Guid? MaintenanceByUserId { get; set; }

    // Resolution (spec §20).
    public DateTimeOffset? ResolvedOn { get; set; }
    public Guid? ResolvedByUserId { get; set; }
    public string? ResolvedByName { get; set; }
    public decimal? FinalTemperatureCelsius { get; set; }
    public string? ResolutionNotes { get; set; }
    /// <summary>Whether an engineer was contacted for the fix (spec §20).</summary>
    public bool? EngineerContacted { get; set; }
    /// <summary>Manager's confirmation that the required food action was completed before closing (spec §20).</summary>
    public bool? FoodActionCompleted { get; set; }
    /// <summary>"Resolved with Warning" — final temperature was in the warning band, not fully back to target.</summary>
    public bool ResolvedWithWarning { get; set; }

    // Per-incident manager approval to close (optional signature, Refusals pattern).
    public Guid? ApprovedByUserId { get; set; }
    public string? ApprovedByName { get; set; }
    public DateTimeOffset? ApprovedOn { get; set; }
    public string? ApprovalSignatureImagePath { get; set; }

    public string? Notes { get; set; }

    public Shop Shop { get; set; } = null!;
    public TemperatureMonitoringUnit TemperatureMonitoringUnit { get; set; } = null!;
    public ICollection<TemperatureReading> Readings { get; set; } = new List<TemperatureReading>();
    public ICollection<TemperatureAttachment> Attachments { get; set; } = new List<TemperatureAttachment>();
}
