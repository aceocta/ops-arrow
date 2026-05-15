namespace ScratchCard.Application.DTOs.Checklists;

public class ShopChecklistTaskDto
{
    public Guid Id { get; set; }
    public Guid ShopId { get; set; }
    public Guid ChecklistGroupId { get; set; }
    public string TaskName { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int DisplayOrder { get; set; }
    public bool IsRequired { get; set; }
    public bool IsActive { get; set; }
    public bool NotesRequiredOnComplete { get; set; }
    public bool RequiredForShopOpen { get; set; }
    public bool RequiredForShiftClose { get; set; }
    public bool RequiredForDayClose { get; set; }
    public bool IsSystemDefault { get; set; }
}

public class ShopChecklistGroupDto
{
    public Guid Id { get; set; }
    public Guid ShopId { get; set; }
    public string GroupName { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int DisplayOrder { get; set; }
    public bool IsActive { get; set; }
    public bool IsSystemDefault { get; set; }
    public IReadOnlyCollection<ShopChecklistTaskDto> Tasks { get; set; } = [];
}

public class CreateShopChecklistGroupRequest
{
    public Guid ShopId { get; set; }
    public string GroupName { get; set; } = string.Empty;
    public string? Description { get; set; }
    public bool IsActive { get; set; } = true;
}

public class UpdateShopChecklistGroupRequest
{
    public string GroupName { get; set; } = string.Empty;
    public string? Description { get; set; }
    public bool IsActive { get; set; } = true;
}

public class ReorderChecklistGroupsRequest
{
    public Guid ShopId { get; set; }
    public IReadOnlyCollection<Guid> OrderedGroupIds { get; set; } = [];
}

public class CreateShopChecklistTaskRequest
{
    public Guid ShopId { get; set; }
    public Guid ChecklistGroupId { get; set; }
    public string TaskName { get; set; } = string.Empty;
    public string? Description { get; set; }
    public bool IsRequired { get; set; } = true;
    public bool IsActive { get; set; } = true;
    public bool NotesRequiredOnComplete { get; set; }
    public bool RequiredForShopOpen { get; set; }
    public bool RequiredForShiftClose { get; set; }
    public bool RequiredForDayClose { get; set; }
}

public class UpdateShopChecklistTaskRequest
{
    public string TaskName { get; set; } = string.Empty;
    public string? Description { get; set; }
    public bool IsRequired { get; set; } = true;
    public bool IsActive { get; set; } = true;
    public bool NotesRequiredOnComplete { get; set; }
    public bool RequiredForShopOpen { get; set; }
    public bool RequiredForShiftClose { get; set; }
    public bool RequiredForDayClose { get; set; }
}

public class ReorderChecklistTasksRequest
{
    public Guid ShopId { get; set; }
    public Guid ChecklistGroupId { get; set; }
    public IReadOnlyCollection<Guid> OrderedTaskIds { get; set; } = [];
}

public class ChecklistTaskCompletionDto
{
    public Guid Id { get; set; }
    public Guid ShopId { get; set; }
    public Guid? CompanyId { get; set; }
    public DateOnly BusinessDate { get; set; }
    public Guid? ShiftId { get; set; }
    public Guid ChecklistGroupId { get; set; }
    public Guid ChecklistTaskId { get; set; }
    public bool IsCompleted { get; set; }
    public Guid? CompletedByUserId { get; set; }
    public string? CompletedByName { get; set; }
    public DateTimeOffset? CompletedOn { get; set; }
    public string? Notes { get; set; }
}

public class ChecklistDailyTaskDto
{
    public ShopChecklistTaskDto Task { get; set; } = new();
    public ChecklistTaskCompletionDto? Completion { get; set; }
}

public class ChecklistDailyGroupDto
{
    public ShopChecklistGroupDto Group { get; set; } = new();
    public int CompletedCount { get; set; }
    public int TotalCount { get; set; }
    public IReadOnlyCollection<ChecklistDailyTaskDto> Tasks { get; set; } = [];
}

public class ChecklistDailyLogDto
{
    public Guid ShopId { get; set; }
    public DateOnly BusinessDate { get; set; }
    public Guid? ShiftId { get; set; }
    public int CompletedCount { get; set; }
    public int TotalCount { get; set; }
    public IReadOnlyCollection<ChecklistDailyGroupDto> Groups { get; set; } = [];
}

public class UpsertChecklistTaskCompletionRequest
{
    public Guid ShopId { get; set; }
    public DateOnly BusinessDate { get; set; }
    public Guid? ShiftId { get; set; }
    public Guid ChecklistTaskId { get; set; }
    public bool IsCompleted { get; set; }
    public string? Notes { get; set; }
}

public class SyncOfflineChecklistCompletionsRequest
{
    public IReadOnlyCollection<UpsertChecklistTaskCompletionRequest> Items { get; set; } = [];
}

public class ChecklistPendingRequiredTaskDto
{
    public Guid ChecklistTaskId { get; set; }
    public string GroupName { get; set; } = string.Empty;
    public string TaskName { get; set; } = string.Empty;
}

public class ChecklistCompletionHistoryRowDto
{
    public Guid CompletionId { get; set; }
    public Guid ShopId { get; set; }
    public Guid? CompanyId { get; set; }
    public DateOnly BusinessDate { get; set; }
    public Guid? ShiftId { get; set; }
    public Guid ChecklistGroupId { get; set; }
    public string ChecklistGroupName { get; set; } = string.Empty;
    public Guid ChecklistTaskId { get; set; }
    public string ChecklistTaskName { get; set; } = string.Empty;
    public bool IsCompleted { get; set; }
    public Guid? CompletedByUserId { get; set; }
    public string? CompletedByName { get; set; }
    public DateTimeOffset? CompletedOn { get; set; }
    public string? Notes { get; set; }
}

