using ScratchCard.Application.DTOs.Common;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.DTOs.TemperatureLogs;

public class TemperatureMonitoringUnitDto
{
    public Guid Id { get; set; }
    public Guid ShopId { get; set; }
    public string UnitName { get; set; } = string.Empty;
    public TemperatureEquipmentType EquipmentType { get; set; }
    public FoodCategory FoodCategory { get; set; }
    public decimal MinTemperatureCelsius { get; set; }
    public decimal MaxTemperatureCelsius { get; set; }
    public bool IsActive { get; set; }
    public EquipmentWorkingStatus CurrentWorkingStatus { get; set; }
    public string? Location { get; set; }
    public string? Notes { get; set; }
    public int DisplayOrder { get; set; }
}

public class TemperatureScheduleDto
{
    public Guid Id { get; set; }
    public Guid ShopId { get; set; }
    // The units this schedule covers. Empty == all units (shop-wide).
    public IReadOnlyCollection<Guid> UnitIds { get; set; } = [];
    public string Label { get; set; } = string.Empty;
    public TimeOnly ExpectedTime { get; set; }
    public int ToleranceMinutes { get; set; }
    public bool IsActive { get; set; }
}

public class UpsertTemperatureScheduleRequest
{
    public Guid ShopId { get; set; }
    // The units this schedule covers. Empty/omitted == all units (shop-wide).
    public IReadOnlyCollection<Guid> UnitIds { get; set; } = [];
    public string Label { get; set; } = string.Empty;
    public TimeOnly ExpectedTime { get; set; }
    public int ToleranceMinutes { get; set; } = 30;
    public bool IsActive { get; set; } = true;
}

public class CreateTemperatureMonitoringUnitRequest
{
    public Guid ShopId { get; set; }
    public string UnitName { get; set; } = string.Empty;
    public TemperatureEquipmentType EquipmentType { get; set; }
    // Omit to derive from EquipmentType (HotFoodDisplay->HotFood, Freezer->Frozen, else ColdFood).
    public FoodCategory? FoodCategory { get; set; }
    public decimal MinTemperatureCelsius { get; set; }
    public decimal MaxTemperatureCelsius { get; set; }
    public bool IsActive { get; set; } = true;
    public string? Location { get; set; }
    public string? Notes { get; set; }
    public int DisplayOrder { get; set; }
    // When true, taking an order number already in use shifts the other units down instead of failing.
    public bool ShiftConflicts { get; set; }
}

public class ReorderTemperatureUnitsRequest
{
    public Guid ShopId { get; set; }
    public IReadOnlyCollection<TemperatureUnitOrderItem> Items { get; set; } = [];
}

public class TemperatureUnitOrderItem
{
    public Guid UnitId { get; set; }
    public int DisplayOrder { get; set; }
}

public class UpdateTemperatureMonitoringUnitRequest
{
    public string UnitName { get; set; } = string.Empty;
    public TemperatureEquipmentType EquipmentType { get; set; }
    // Omit to derive from EquipmentType (HotFoodDisplay->HotFood, Freezer->Frozen, else ColdFood).
    public FoodCategory? FoodCategory { get; set; }
    public decimal MinTemperatureCelsius { get; set; }
    public decimal MaxTemperatureCelsius { get; set; }
    public bool IsActive { get; set; } = true;
    public string? Location { get; set; }
    public string? Notes { get; set; }
    public int DisplayOrder { get; set; }
    // When true, taking an order number already in use shifts the other units down instead of failing.
    public bool ShiftConflicts { get; set; }
}

public class RecordTemperatureReadingRequest
{
    public Guid ShopId { get; set; }
    public Guid TemperatureMonitoringUnitId { get; set; }
    public DateOnly ReadingDate { get; set; }
    public TimeOnly ReadingTime { get; set; }
    public decimal TemperatureCelsius { get; set; }
    public string? CheckedByInitials { get; set; }
    public string? Notes { get; set; }
    public string? ActionTaken { get; set; }
    // Comma-separated TemperatureCorrectiveAction names selected for a Warning/Fail reading.
    public string? CorrectiveActions { get; set; }

    // Spec §12/§14 — the questions staff answer on a FAIL reading. "Is the equipment working?" is Yes
    // only when EquipmentWorking == true; a No / Not-sure / omitted answer is treated as not-working and
    // opens an equipment issue (mark Not Working). The rest record how the food was handled.
    public bool? EquipmentWorking { get; set; }
    public bool? ManagerInformed { get; set; }
    public bool? FoodMoved { get; set; }
    public string? FoodMovedTo { get; set; }
    public bool? FoodDiscarded { get; set; }
    // Optional §16 time-control anchor: when the food is known to have first gone outside the safe range.
    // Omit to anchor the dwell timer at the moment the failing reading is recorded.
    public DateTimeOffset? FoodOutOfRangeSince { get; set; }

    // Optional §10 photos for the check (base64, ≤10MB each; stored as blobs, not in the DB).
    public IReadOnlyCollection<CloseAttachmentUploadRequest>? Attachments { get; set; }

    // The check this reading is logged against. Pass a scheduled slot's id to bind the reading to
    // that check (it is still evaluated late if outside the slot's tolerance), or the shop's random
    // schedule id for an ad-hoc/extra check. Null lets the server place it: it window-matches an
    // active scheduled slot, falling back to the shop's random-check bucket when none applies.
    public Guid? ScheduleId { get; set; }
}

public class TemperatureReadingDto
{
    public Guid Id { get; set; }
    public Guid ShopId { get; set; }
    public Guid TemperatureMonitoringUnitId { get; set; }
    public string UnitName { get; set; } = string.Empty;
    public TemperatureEquipmentType EquipmentType { get; set; }
    public decimal MinTemperatureCelsius { get; set; }
    public decimal MaxTemperatureCelsius { get; set; }
    public DateOnly ReadingDate { get; set; }
    public TimeOnly ReadingTime { get; set; }
    public decimal TemperatureCelsius { get; set; }
    public bool IsOutOfRange { get; set; }
    public TemperatureResult Result { get; set; }
    public string CheckedByInitials { get; set; } = string.Empty;
    public string? Notes { get; set; }
    public string? ActionTaken { get; set; }
    public string? CorrectiveActions { get; set; }
    // Set when a failing reading opened or attached to a food-safety / equipment incident (§12/§14/§16).
    public Guid? TemperatureEquipmentIssueId { get; set; }
    public DateTimeOffset RecordedOn { get; set; }
    public string? RecordedByName { get; set; }
    // Scheduled-check binding (null when no schedule matched this reading).
    public Guid? ScheduleId { get; set; }
    public string? ScheduleLabel { get; set; }
    public bool IsLateForSchedule { get; set; }
    // §10 photos attached to this reading (metadata only; fetch content via the attachment endpoint).
    public IReadOnlyCollection<CloseAttachmentDto> Attachments { get; set; } = [];
}

public enum TemperatureScheduleCellState
{
    Upcoming = 0,
    OnTime = 1,
    Late = 2,
    Missed = 3,
    // Logged before the slot's tolerance window (the reading still belongs to this slot).
    Early = 4
}

public class TemperatureScheduleGridSlotDto
{
    public Guid ScheduleId { get; set; }
    public Guid? UnitId { get; set; }
    public string Label { get; set; } = string.Empty;
    public TimeOnly ExpectedTime { get; set; }
    public int ToleranceMinutes { get; set; }
}

public class TemperatureScheduleGridUnitDto
{
    public Guid UnitId { get; set; }
    public string UnitName { get; set; } = string.Empty;
    public int DisplayOrder { get; set; }
}

public class TemperatureScheduleGridCellDto
{
    public DateOnly Date { get; set; }
    public Guid UnitId { get; set; }
    public Guid ScheduleId { get; set; }
    public TemperatureScheduleCellState State { get; set; }
    public Guid? ReadingId { get; set; }
    public TimeOnly? ReadingTime { get; set; }
    public decimal? TemperatureCelsius { get; set; }
    public bool? IsOutOfRange { get; set; }
    public bool IsLate { get; set; }
}

public class TemperatureScheduleGridDto
{
    public DateOnly From { get; set; }
    public DateOnly To { get; set; }
    public IReadOnlyCollection<TemperatureScheduleGridUnitDto> Units { get; set; } = [];
    public IReadOnlyCollection<TemperatureScheduleGridSlotDto> Slots { get; set; } = [];
    public IReadOnlyCollection<TemperatureScheduleGridCellDto> Cells { get; set; } = [];
    public int OnTimeCount { get; set; }
    public int EarlyCount { get; set; }
    public int LateCount { get; set; }
    public int MissedCount { get; set; }
}

public class SignOffTemperatureDailyLogRequest
{
    public Guid ShopId { get; set; }
    public DateOnly SignoffDate { get; set; }
    public string? SignedByInitials { get; set; }
    public string? Notes { get; set; }
}

public class TemperatureDailySignoffDto
{
    public Guid Id { get; set; }
    public Guid ShopId { get; set; }
    public DateOnly SignoffDate { get; set; }
    public DateTimeOffset SignedOn { get; set; }
    public Guid SignedByUserId { get; set; }
    public string SignedByInitials { get; set; } = string.Empty;
    public string SignedByName { get; set; } = string.Empty;
    public string? Notes { get; set; }
}

public class TemperatureUnitDailyLogDto
{
    public TemperatureMonitoringUnitDto Unit { get; set; } = new();
    public IReadOnlyCollection<TemperatureReadingDto> Readings { get; set; } = [];
}

public class TemperatureDailyLogDto
{
    public Guid ShopId { get; set; }
    public DateOnly Date { get; set; }
    public TemperatureDailySignoffDto? Signoff { get; set; }
    public IReadOnlyCollection<TemperatureUnitDailyLogDto> Units { get; set; } = [];
}

public class TemperatureEquipmentIssueDto
{
    public Guid Id { get; set; }
    public Guid ShopId { get; set; }
    public Guid TemperatureMonitoringUnitId { get; set; }
    public string UnitName { get; set; } = string.Empty;
    public FoodCategory FoodCategory { get; set; }
    public EquipmentWorkingStatus Status { get; set; }
    public string Reason { get; set; } = string.Empty;
    public decimal? TemperatureAtOpenCelsius { get; set; }
    public bool OpenedFromReading { get; set; }
    public DateTimeOffset IssueStartedOn { get; set; }
    public string? OpenedByName { get; set; }
    public bool? FoodAffected { get; set; }
    public bool? FoodMoved { get; set; }
    public string? FoodMovedTo { get; set; }
    public bool? FoodDiscarded { get; set; }
    public bool? ManagerInformed { get; set; }
    public string? CorrectiveActions { get; set; }
    public DateTimeOffset? MaintenanceStartedOn { get; set; }
    public DateTimeOffset? ResolvedOn { get; set; }
    public string? ResolvedByName { get; set; }
    public decimal? FinalTemperatureCelsius { get; set; }
    public string? ResolutionNotes { get; set; }
    public bool? EngineerContacted { get; set; }
    public bool? FoodActionCompleted { get; set; }
    public bool ResolvedWithWarning { get; set; }
    public string? ApprovedByName { get; set; }
    public DateTimeOffset? ApprovedOn { get; set; }
    public string? Notes { get; set; }
    // §15/§20 photos attached to this issue (metadata only; fetch content via the attachment endpoint).
    public IReadOnlyCollection<CloseAttachmentDto> Attachments { get; set; } = [];
}

public class MarkUnitNotWorkingRequest
{
    public Guid ShopId { get; set; }
    public Guid TemperatureMonitoringUnitId { get; set; }
    public string Reason { get; set; } = string.Empty;
    public decimal? CurrentTemperatureCelsius { get; set; }
    public DateTimeOffset? IssueNoticedOn { get; set; }
    public bool? FoodAffected { get; set; }
    public bool? FoodMoved { get; set; }
    public string? FoodMovedTo { get; set; }
    public bool? FoodDiscarded { get; set; }
    public bool? ManagerInformed { get; set; }
    public string? CorrectiveActions { get; set; }
    public string? Notes { get; set; }
    // Optional §15 photos for the equipment issue (base64, ≤10MB each).
    public IReadOnlyCollection<CloseAttachmentUploadRequest>? Attachments { get; set; }
}

public class SetIssueUnderMaintenanceRequest
{
    public string? Notes { get; set; }
}

public class ResolveTemperatureIssueRequest
{
    // Nullable + required: §20 says a final temperature must be recorded before a unit returns to Working.
    // A non-nullable decimal would default a missing value to 0°C, which grades Pass for a cold unit and
    // would silently re-activate an un-rechecked fridge.
    public decimal? FinalTemperatureCelsius { get; set; }
    // §20 "Action taken (req)" — required to close.
    public string? ResolutionNotes { get; set; }
    public bool? EngineerContacted { get; set; }
    public bool? FoodActionCompleted { get; set; }
    public string? Notes { get; set; }
    // Optional §20 photos for the resolution (base64, ≤10MB each).
    public IReadOnlyCollection<CloseAttachmentUploadRequest>? Attachments { get; set; }
}

// One unit that is trending toward (but has not yet crossed) its safe range.
public record TemperaturePredictionDto(
    Guid UnitId,
    string UnitName,
    string Direction,            // "Rising" | "Falling"
    decimal CurrentCelsius,
    decimal RatePerHourCelsius,
    decimal LimitCelsius,
    int MinutesToBreach,
    string Message);

public record TemperaturePredictiveCheckResult(
    int UnitsEvaluated,
    IReadOnlyList<TemperaturePredictionDto> Predictions);
