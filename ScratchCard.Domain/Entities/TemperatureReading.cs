using ScratchCard.Domain.Common;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Domain.Entities;

public class TemperatureReading : AuditableEntity
{
    public Guid ShopId { get; set; }
    public Guid TemperatureMonitoringUnitId { get; set; }
    public DateOnly ReadingDate { get; set; }
    public TimeOnly ReadingTime { get; set; }
    public decimal TemperatureCelsius { get; set; }
    // Legacy binary flag — kept so existing grid/report queries keep working. Set alongside Result.
    public bool IsOutOfRange { get; set; }
    // Three-tier food-safety verdict from TemperatureEvaluator (Pass / Warning / Fail).
    public TemperatureResult Result { get; set; } = TemperatureResult.Pass;
    public string CheckedByInitials { get; set; } = string.Empty;
    public string? Notes { get; set; }
    // Free-text action (retained, used for "Other" detail); structured codes go in CorrectiveActions.
    public string? ActionTaken { get; set; }
    // Comma-separated TemperatureCorrectiveAction codes selected for a Warning/Fail reading.
    public string? CorrectiveActions { get; set; }
    // Set when a Fail reading opens or attaches to an equipment issue.
    public Guid? TemperatureEquipmentIssueId { get; set; }
    public DateTimeOffset RecordedOn { get; set; }
    public Guid? RecordedByUserId { get; set; }
    public string? RecordedByName { get; set; }

    // When scheduled checks are configured for the shop, a recorded reading is matched to the
    // nearest unsatisfied schedule for the day. ScheduleId is null when the reading didn't match
    // any slot (ad-hoc / extra reading). IsLateForSchedule is true when the reading was outside
    // the slot's tolerance window (still on the same business day).
    public Guid? ScheduleId { get; set; }
    public bool IsLateForSchedule { get; set; }

    public Shop Shop { get; set; } = null!;
    public TemperatureMonitoringUnit TemperatureMonitoringUnit { get; set; } = null!;
    public CfgTemperatureSchedule? Schedule { get; set; }
    public TemperatureEquipmentIssue? TemperatureEquipmentIssue { get; set; }
    public ICollection<TemperatureAttachment> Attachments { get; set; } = new List<TemperatureAttachment>();
}
