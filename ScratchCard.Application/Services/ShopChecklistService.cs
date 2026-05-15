using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Checklists;
using ScratchCard.Domain.Entities;

namespace ScratchCard.Application.Services;

public class ShopChecklistService : IShopChecklistService
{
    private readonly IRepository<ShopChecklistGroup> _groupRepository;
    private readonly IRepository<ShopChecklistTask> _taskRepository;
    private readonly IRepository<ShopChecklistTaskCompletion> _completionRepository;
    private readonly IRepository<Shop> _shopRepository;
    private readonly IAuditService _auditService;
    private readonly ICurrentUserService _currentUserService;
    private readonly IUnitOfWork _unitOfWork;

    public ShopChecklistService(
        IRepository<ShopChecklistGroup> groupRepository,
        IRepository<ShopChecklistTask> taskRepository,
        IRepository<ShopChecklistTaskCompletion> completionRepository,
        IRepository<Shop> shopRepository,
        IAuditService auditService,
        ICurrentUserService currentUserService,
        IUnitOfWork unitOfWork)
    {
        _groupRepository = groupRepository;
        _taskRepository = taskRepository;
        _completionRepository = completionRepository;
        _shopRepository = shopRepository;
        _auditService = auditService;
        _currentUserService = currentUserService;
        _unitOfWork = unitOfWork;
    }

    public async Task<IReadOnlyCollection<ShopChecklistGroupDto>> ListConfigurationAsync(Guid shopId, CancellationToken cancellationToken = default)
    {
        await EnsureDefaultTemplateAsync(shopId, cancellationToken);

        var groups = await _groupRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && !x.IsDeleted)
            .Include(x => x.Tasks.Where(t => !t.IsDeleted))
            .OrderBy(x => x.DisplayOrder)
            .ThenBy(x => x.GroupName)
            .ToListAsync(cancellationToken);

        return groups.Select(x => x.ToDto()).ToArray();
    }

    public async Task<ShopChecklistGroupDto> CreateGroupAsync(CreateShopChecklistGroupRequest request, CancellationToken cancellationToken = default)
    {
        var groupName = NormalizeRequiredText(request.GroupName, "Checklist group name is required.");
        var duplicate = await _groupRepository.Query()
            .AsNoTracking()
            .AnyAsync(
                x => x.ShopId == request.ShopId
                    && !x.IsDeleted
                    && x.GroupName == groupName,
                cancellationToken);
        if (duplicate)
        {
            throw new AppException("checklist_group_duplicate", "Checklist group name already exists.");
        }

        var nextDisplayOrder = (await _groupRepository.Query()
            .Where(x => x.ShopId == request.ShopId && !x.IsDeleted)
            .Select(x => (int?)x.DisplayOrder)
            .MaxAsync(cancellationToken) ?? 0) + 1;

        var now = DateTimeOffset.UtcNow;
        var group = new ShopChecklistGroup
        {
            ShopId = request.ShopId,
            GroupName = groupName,
            Description = NormalizeOptionalText(request.Description),
            DisplayOrder = nextDisplayOrder,
            IsActive = request.IsActive,
            IsSystemDefault = false,
            CreatedOn = now,
            CreatedBy = _currentUserService.UserId
        };

        await _groupRepository.AddAsync(group, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(
            nameof(ShopChecklistGroup),
            group.Id,
            "ChecklistGroupCreated",
            group.ShopId,
            cancellationToken: cancellationToken);

        return group.ToDto();
    }

    public async Task<ShopChecklistGroupDto> UpdateGroupAsync(Guid id, UpdateShopChecklistGroupRequest request, CancellationToken cancellationToken = default)
    {
        var group = await _groupRepository.Query()
            .Include(x => x.Tasks.Where(t => !t.IsDeleted))
            .FirstOrDefaultAsync(x => x.Id == id && !x.IsDeleted, cancellationToken)
            ?? throw new AppException("checklist_group_not_found", "Checklist group not found.", 404);

        var groupName = NormalizeRequiredText(request.GroupName, "Checklist group name is required.");
        var duplicate = await _groupRepository.Query()
            .AsNoTracking()
            .AnyAsync(
                x => x.Id != id
                    && x.ShopId == group.ShopId
                    && !x.IsDeleted
                    && x.GroupName == groupName,
                cancellationToken);
        if (duplicate)
        {
            throw new AppException("checklist_group_duplicate", "Checklist group name already exists.");
        }

        group.GroupName = groupName;
        group.Description = NormalizeOptionalText(request.Description);
        group.IsActive = request.IsActive;
        group.ModifiedOn = DateTimeOffset.UtcNow;
        group.ModifiedBy = _currentUserService.UserId;

        _groupRepository.Update(group);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(
            nameof(ShopChecklistGroup),
            group.Id,
            "ChecklistGroupUpdated",
            group.ShopId,
            cancellationToken: cancellationToken);

        return group.ToDto();
    }

    public async Task ReorderGroupsAsync(ReorderChecklistGroupsRequest request, CancellationToken cancellationToken = default)
    {
        var orderedIds = request.OrderedGroupIds
            .Where(x => x != Guid.Empty)
            .Distinct()
            .ToArray();
        if (orderedIds.Length == 0)
        {
            return;
        }

        var groups = await _groupRepository.Query()
            .Where(x => x.ShopId == request.ShopId && !x.IsDeleted && orderedIds.Contains(x.Id))
            .ToListAsync(cancellationToken);
        if (groups.Count != orderedIds.Length)
        {
            throw new AppException("checklist_group_reorder_invalid", "One or more checklist groups were not found.");
        }

        var displayOrder = 1;
        var now = DateTimeOffset.UtcNow;
        foreach (var groupId in orderedIds)
        {
            var group = groups.First(x => x.Id == groupId);
            group.DisplayOrder = displayOrder++;
            group.ModifiedOn = now;
            group.ModifiedBy = _currentUserService.UserId;
            _groupRepository.Update(group);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);
    }

    public async Task<ShopChecklistTaskDto> CreateTaskAsync(CreateShopChecklistTaskRequest request, CancellationToken cancellationToken = default)
    {
        var group = await _groupRepository.Query()
            .AsNoTracking()
            .FirstOrDefaultAsync(
                x => x.Id == request.ChecklistGroupId
                    && x.ShopId == request.ShopId
                    && !x.IsDeleted,
                cancellationToken)
            ?? throw new AppException("checklist_group_not_found", "Checklist group not found.", 404);

        var taskName = NormalizeRequiredText(request.TaskName, "Checklist task name is required.");
        var duplicate = await _taskRepository.Query()
            .AsNoTracking()
            .AnyAsync(
                x => x.ChecklistGroupId == request.ChecklistGroupId
                    && !x.IsDeleted
                    && x.TaskName == taskName,
                cancellationToken);
        if (duplicate)
        {
            throw new AppException("checklist_task_duplicate", "Checklist task name already exists in this group.");
        }

        var nextDisplayOrder = (await _taskRepository.Query()
            .Where(x => x.ChecklistGroupId == request.ChecklistGroupId && !x.IsDeleted)
            .Select(x => (int?)x.DisplayOrder)
            .MaxAsync(cancellationToken) ?? 0) + 1;

        var now = DateTimeOffset.UtcNow;
        var task = new ShopChecklistTask
        {
            ShopId = request.ShopId,
            ChecklistGroupId = group.Id,
            TaskName = taskName,
            Description = NormalizeOptionalText(request.Description),
            DisplayOrder = nextDisplayOrder,
            IsRequired = request.IsRequired,
            IsActive = request.IsActive,
            NotesRequiredOnComplete = request.NotesRequiredOnComplete,
            RequiredForShopOpen = request.RequiredForShopOpen,
            RequiredForShiftClose = request.RequiredForShiftClose,
            RequiredForDayClose = request.RequiredForDayClose,
            IsSystemDefault = false,
            CreatedOn = now,
            CreatedBy = _currentUserService.UserId
        };

        await _taskRepository.AddAsync(task, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(
            nameof(ShopChecklistTask),
            task.Id,
            "ChecklistTaskCreated",
            task.ShopId,
            cancellationToken: cancellationToken);

        return task.ToDto();
    }

    public async Task<ShopChecklistTaskDto> UpdateTaskAsync(Guid id, UpdateShopChecklistTaskRequest request, CancellationToken cancellationToken = default)
    {
        var task = await _taskRepository.Query()
            .FirstOrDefaultAsync(x => x.Id == id && !x.IsDeleted, cancellationToken)
            ?? throw new AppException("checklist_task_not_found", "Checklist task not found.", 404);

        var taskName = NormalizeRequiredText(request.TaskName, "Checklist task name is required.");
        var duplicate = await _taskRepository.Query()
            .AsNoTracking()
            .AnyAsync(
                x => x.Id != id
                    && x.ChecklistGroupId == task.ChecklistGroupId
                    && !x.IsDeleted
                    && x.TaskName == taskName,
                cancellationToken);
        if (duplicate)
        {
            throw new AppException("checklist_task_duplicate", "Checklist task name already exists in this group.");
        }

        task.TaskName = taskName;
        task.Description = NormalizeOptionalText(request.Description);
        task.IsRequired = request.IsRequired;
        task.IsActive = request.IsActive;
        task.NotesRequiredOnComplete = request.NotesRequiredOnComplete;
        task.RequiredForShopOpen = request.RequiredForShopOpen;
        task.RequiredForShiftClose = request.RequiredForShiftClose;
        task.RequiredForDayClose = request.RequiredForDayClose;
        task.ModifiedOn = DateTimeOffset.UtcNow;
        task.ModifiedBy = _currentUserService.UserId;

        _taskRepository.Update(task);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(
            nameof(ShopChecklistTask),
            task.Id,
            "ChecklistTaskUpdated",
            task.ShopId,
            cancellationToken: cancellationToken);

        return task.ToDto();
    }

    public async Task ReorderTasksAsync(ReorderChecklistTasksRequest request, CancellationToken cancellationToken = default)
    {
        var orderedTaskIds = request.OrderedTaskIds
            .Where(x => x != Guid.Empty)
            .Distinct()
            .ToArray();
        if (orderedTaskIds.Length == 0)
        {
            return;
        }

        var tasks = await _taskRepository.Query()
            .Where(
                x => x.ShopId == request.ShopId
                    && x.ChecklistGroupId == request.ChecklistGroupId
                    && !x.IsDeleted
                    && orderedTaskIds.Contains(x.Id))
            .ToListAsync(cancellationToken);
        if (tasks.Count != orderedTaskIds.Length)
        {
            throw new AppException("checklist_task_reorder_invalid", "One or more checklist tasks were not found.");
        }

        var displayOrder = 1;
        var now = DateTimeOffset.UtcNow;
        foreach (var taskId in orderedTaskIds)
        {
            var task = tasks.First(x => x.Id == taskId);
            task.DisplayOrder = displayOrder++;
            task.ModifiedOn = now;
            task.ModifiedBy = _currentUserService.UserId;
            _taskRepository.Update(task);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);
    }

    public async Task<ChecklistDailyLogDto> GetDailyChecklistAsync(Guid shopId, DateOnly businessDate, Guid? shiftId = null, CancellationToken cancellationToken = default)
    {
        await EnsureDefaultTemplateAsync(shopId, cancellationToken);

        var groups = await _groupRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && x.IsActive && !x.IsDeleted)
            .Include(x => x.Tasks.Where(t => t.IsActive && !t.IsDeleted))
            .OrderBy(x => x.DisplayOrder)
            .ThenBy(x => x.GroupName)
            .ToListAsync(cancellationToken);

        var activeTaskIds = groups
            .SelectMany(x => x.Tasks)
            .Select(x => x.Id)
            .Distinct()
            .ToArray();
        if (activeTaskIds.Length == 0)
        {
            return new ChecklistDailyLogDto
            {
                ShopId = shopId,
                BusinessDate = businessDate,
                ShiftId = shiftId,
                CompletedCount = 0,
                TotalCount = 0,
                Groups = []
            };
        }

        var completionsQuery = _completionRepository.Query()
            .AsNoTracking()
            .Where(
                x => x.ShopId == shopId
                    && x.BusinessDate == businessDate
                    && activeTaskIds.Contains(x.ChecklistTaskId));

        completionsQuery = shiftId.HasValue
            ? completionsQuery.Where(x => x.ShiftId == shiftId.Value)
            : completionsQuery.Where(x => x.ShiftId == null);

        var completions = await completionsQuery.ToListAsync(cancellationToken);
        var completionLookup = completions.ToDictionary(x => x.ChecklistTaskId, x => x);

        var groupDtos = new List<ChecklistDailyGroupDto>(groups.Count);
        var totalCount = 0;
        var completedCount = 0;

        foreach (var group in groups)
        {
            var orderedTasks = group.Tasks
                .OrderBy(x => x.DisplayOrder)
                .ThenBy(x => x.TaskName)
                .ToArray();
            var taskDtos = new List<ChecklistDailyTaskDto>(orderedTasks.Length);
            var groupCompletedCount = 0;

            foreach (var task in orderedTasks)
            {
                completionLookup.TryGetValue(task.Id, out var completion);
                if (completion?.IsCompleted == true)
                {
                    groupCompletedCount++;
                }

                taskDtos.Add(new ChecklistDailyTaskDto
                {
                    Task = task.ToDto(),
                    Completion = completion?.ToDto()
                });
            }

            var groupTotalCount = taskDtos.Count;
            totalCount += groupTotalCount;
            completedCount += groupCompletedCount;

            groupDtos.Add(new ChecklistDailyGroupDto
            {
                Group = new ShopChecklistGroupDto
                {
                    Id = group.Id,
                    ShopId = group.ShopId,
                    GroupName = group.GroupName,
                    Description = group.Description,
                    DisplayOrder = group.DisplayOrder,
                    IsActive = group.IsActive,
                    IsSystemDefault = group.IsSystemDefault,
                    Tasks = orderedTasks.Select(x => x.ToDto()).ToArray()
                },
                CompletedCount = groupCompletedCount,
                TotalCount = groupTotalCount,
                Tasks = taskDtos
            });
        }

        return new ChecklistDailyLogDto
        {
            ShopId = shopId,
            BusinessDate = businessDate,
            ShiftId = shiftId,
            CompletedCount = completedCount,
            TotalCount = totalCount,
            Groups = groupDtos
        };
    }

    public async Task<ChecklistTaskCompletionDto> UpsertTaskCompletionAsync(UpsertChecklistTaskCompletionRequest request, CancellationToken cancellationToken = default)
    {
        var completion = await UpsertTaskCompletionInternalAsync(request, saveImmediately: true, cancellationToken);
        return completion.ToDto();
    }

    public async Task<IReadOnlyCollection<ChecklistTaskCompletionDto>> SyncOfflineCompletionsAsync(SyncOfflineChecklistCompletionsRequest request, CancellationToken cancellationToken = default)
    {
        var items = request.Items
            .Where(x => x.ChecklistTaskId != Guid.Empty && x.ShopId != Guid.Empty)
            .ToArray();
        if (items.Length == 0)
        {
            return [];
        }

        var deduped = items
            .GroupBy(x => $"{x.ShopId:N}-{x.BusinessDate:yyyyMMdd}-{x.ShiftId?.ToString("N") ?? "noshift"}-{x.ChecklistTaskId:N}")
            .Select(x => x.Last())
            .ToArray();

        var results = new List<ShopChecklistTaskCompletion>(deduped.Length);
        foreach (var item in deduped)
        {
            var result = await UpsertTaskCompletionInternalAsync(item, saveImmediately: false, cancellationToken);
            results.Add(result);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return results.Select(x => x.ToDto()).ToArray();
    }

    public async Task<IReadOnlyCollection<ChecklistCompletionHistoryRowDto>> GetCompletionHistoryAsync(Guid shopId, DateOnly from, DateOnly to, CancellationToken cancellationToken = default)
    {
        if (from > to)
        {
            throw new AppException("checklist_history_invalid_range", "From date cannot be after to date.");
        }

        var rows = await _completionRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && x.BusinessDate >= from && x.BusinessDate <= to)
            .Include(x => x.ChecklistGroup)
            .Include(x => x.ChecklistTask)
            .OrderByDescending(x => x.BusinessDate)
            .ThenBy(x => x.ChecklistGroup.DisplayOrder)
            .ThenBy(x => x.ChecklistTask.DisplayOrder)
            .ToListAsync(cancellationToken);

        return rows.Select(x => new ChecklistCompletionHistoryRowDto
        {
            CompletionId = x.Id,
            ShopId = x.ShopId,
            CompanyId = x.CompanyId,
            BusinessDate = x.BusinessDate,
            ShiftId = x.ShiftId,
            ChecklistGroupId = x.ChecklistGroupId,
            ChecklistGroupName = x.ChecklistGroup.GroupName,
            ChecklistTaskId = x.ChecklistTaskId,
            ChecklistTaskName = x.ChecklistTask.TaskName,
            IsCompleted = x.IsCompleted,
            CompletedByUserId = x.CompletedByUserId,
            CompletedByName = x.CompletedByName,
            CompletedOn = x.CompletedOn,
            Notes = x.Notes
        }).ToArray();
    }

    public async Task<IReadOnlyCollection<ChecklistPendingRequiredTaskDto>> GetPendingRequiredDayCloseTasksAsync(
        Guid shopId,
        DateOnly businessDate,
        CancellationToken cancellationToken = default)
    {
        await EnsureDefaultTemplateAsync(shopId, cancellationToken);

        var requiredTasks = await _taskRepository.Query()
            .AsNoTracking()
            .Where(
                x => x.ShopId == shopId
                    && !x.IsDeleted
                    && x.IsActive
                    && x.IsRequired
                    && x.RequiredForDayClose
                    && x.ChecklistGroup.IsActive
                    && !x.ChecklistGroup.IsDeleted)
            .Include(x => x.ChecklistGroup)
            .OrderBy(x => x.ChecklistGroup.DisplayOrder)
            .ThenBy(x => x.DisplayOrder)
            .ToListAsync(cancellationToken);
        if (requiredTasks.Count == 0)
        {
            return [];
        }

        var requiredTaskIds = requiredTasks.Select(x => x.Id).ToArray();
        var completions = await _completionRepository.Query()
            .AsNoTracking()
            .Where(
                x => x.ShopId == shopId
                    && x.BusinessDate == businessDate
                    && x.ShiftId == null
                    && requiredTaskIds.Contains(x.ChecklistTaskId))
            .ToListAsync(cancellationToken);

        var completedTaskIds = completions
            .Where(x => x.IsCompleted)
            .Select(x => x.ChecklistTaskId)
            .ToHashSet();

        return requiredTasks
            .Where(x => !completedTaskIds.Contains(x.Id))
            .Select(x => new ChecklistPendingRequiredTaskDto
            {
                ChecklistTaskId = x.Id,
                GroupName = x.ChecklistGroup.GroupName,
                TaskName = x.TaskName
            })
            .ToArray();
    }

    private async Task<ShopChecklistTaskCompletion> UpsertTaskCompletionInternalAsync(
        UpsertChecklistTaskCompletionRequest request,
        bool saveImmediately,
        CancellationToken cancellationToken)
    {
        var task = await _taskRepository.Query()
            .Include(x => x.ChecklistGroup)
            .FirstOrDefaultAsync(
                x => x.Id == request.ChecklistTaskId
                    && x.ShopId == request.ShopId
                    && !x.IsDeleted,
                cancellationToken)
            ?? throw new AppException("checklist_task_not_found", "Checklist task not found.", 404);

        if (!task.IsActive || task.ChecklistGroup.IsDeleted || !task.ChecklistGroup.IsActive)
        {
            throw new AppException("checklist_task_inactive", "Checklist task is inactive.");
        }

        if (request.IsCompleted && task.NotesRequiredOnComplete && string.IsNullOrWhiteSpace(request.Notes))
        {
            throw new AppException("checklist_notes_required", "Notes are required for this checklist task.");
        }

        var completion = await _completionRepository.Query()
            .FirstOrDefaultAsync(
                x => x.ShopId == request.ShopId
                    && x.BusinessDate == request.BusinessDate
                    && x.ShiftId == request.ShiftId
                    && x.ChecklistTaskId == request.ChecklistTaskId,
                cancellationToken);

        var now = DateTimeOffset.UtcNow;
        var companyId = await _shopRepository.Query()
            .AsNoTracking()
            .Where(x => x.Id == request.ShopId)
            .Select(x => x.CompanyId)
            .FirstOrDefaultAsync(cancellationToken);

        if (completion is null)
        {
            completion = new ShopChecklistTaskCompletion
            {
                ShopId = request.ShopId,
                CompanyId = companyId,
                BusinessDate = request.BusinessDate,
                ShiftId = request.ShiftId,
                ChecklistGroupId = task.ChecklistGroupId,
                ChecklistTaskId = task.Id,
                CreatedOn = now,
                CreatedBy = _currentUserService.UserId
            };

            await _completionRepository.AddAsync(completion, cancellationToken);
        }
        else
        {
            completion.ModifiedOn = now;
            completion.ModifiedBy = _currentUserService.UserId;
            completion.CompanyId = completion.CompanyId ?? companyId;
        }

        completion.IsCompleted = request.IsCompleted;
        completion.Notes = NormalizeOptionalText(request.Notes);
        if (request.IsCompleted)
        {
            completion.CompletedByUserId = _currentUserService.UserId;
            completion.CompletedByName = _currentUserService.FullName;
            completion.CompletedOn = now;
        }
        else
        {
            completion.CompletedByUserId = null;
            completion.CompletedByName = null;
            completion.CompletedOn = null;
        }

        _completionRepository.Update(completion);

        if (saveImmediately)
        {
            await _unitOfWork.SaveChangesAsync(cancellationToken);
        }

        await _auditService.LogAsync(
            nameof(ShopChecklistTaskCompletion),
            completion.Id,
            request.IsCompleted ? "ChecklistTaskCompleted" : "ChecklistTaskUncompleted",
            request.ShopId,
            reason: task.TaskName,
            cancellationToken: cancellationToken);

        return completion;
    }

    private async Task EnsureDefaultTemplateAsync(Guid shopId, CancellationToken cancellationToken)
    {
        var hasGroups = await _groupRepository.Query()
            .AsNoTracking()
            .AnyAsync(x => x.ShopId == shopId && !x.IsDeleted, cancellationToken);
        if (hasGroups)
        {
            return;
        }

        var now = DateTimeOffset.UtcNow;
        var createdBy = _currentUserService.UserId;
        var groups = BuildDefaultTemplate(shopId, now, createdBy);
        var tasks = groups
            .SelectMany(group => group.Tasks)
            .ToArray();

        await _groupRepository.AddRangeAsync(groups, cancellationToken);
        await _taskRepository.AddRangeAsync(tasks, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
    }

    private static ShopChecklistGroup[] BuildDefaultTemplate(Guid shopId, DateTimeOffset now, Guid? createdBy)
    {
        var template = new[]
        {
            new ChecklistTemplateGroup(
                "Opening checklist",
                "Start-of-day readiness checks.",
                new[]
                {
                    new ChecklistTemplateTask("Switch on tills", true, false, true, false, false),
                    new ChecklistTemplateTask("Check cash float", true, false, true, false, false),
                    new ChecklistTemplateTask("Check fridge temperature", true, false, true, false, false),
                    new ChecklistTemplateTask("Check lottery or scratch card display", true, false, true, false, false),
                    new ChecklistTemplateTask("Check shop floor readiness", true, false, true, false, false)
                }),
            new ChecklistTemplateGroup(
                "Cleaning checklist",
                "Routine cleaning during operation.",
                new[]
                {
                    new ChecklistTemplateTask("Clean coffee machine", false, false, false, false, false),
                    new ChecklistTemplateTask("Clean ice cream machine", false, false, false, false, false),
                    new ChecklistTemplateTask("Clean food counter", true, false, false, false, false),
                    new ChecklistTemplateTask("Mop floor", true, false, false, false, false),
                    new ChecklistTemplateTask("Empty bins", true, false, false, false, false)
                }),
            new ChecklistTemplateGroup(
                "Machine cleaning checklist",
                "Machine sanitation and checks.",
                new[]
                {
                    new ChecklistTemplateTask("Clean lottery terminal area", true, false, false, false, false),
                    new ChecklistTemplateTask("Check barcode scanner lenses", false, false, false, false, false),
                    new ChecklistTemplateTask("Wipe card machine surfaces", true, false, false, false, false)
                }),
            new ChecklistTemplateGroup(
                "Safety checklist",
                "Safety and compliance checks.",
                new[]
                {
                    new ChecklistTemplateTask("Check emergency exits are clear", true, false, false, false, false),
                    new ChecklistTemplateTask("Check fire extinguisher visibility", true, false, false, false, false),
                    new ChecklistTemplateTask("Check CCTV status", true, true, false, false, false)
                }),
            new ChecklistTemplateGroup(
                "Closing checklist",
                "End-of-day close checks.",
                new[]
                {
                    new ChecklistTemplateTask("Close tills", true, false, false, true, true),
                    new ChecklistTemplateTask("Turn off lights", true, false, false, false, true),
                    new ChecklistTemplateTask("Shut down required machines", true, false, false, true, true),
                    new ChecklistTemplateTask("Check fridges", true, true, false, false, true),
                    new ChecklistTemplateTask("Lock doors", true, false, false, false, true),
                    new ChecklistTemplateTask("Set alarm", true, false, false, false, true),
                    new ChecklistTemplateTask("Final security check", true, true, false, false, true)
                }),
        };

        var groups = new List<ShopChecklistGroup>(template.Length);
        for (var groupIndex = 0; groupIndex < template.Length; groupIndex++)
        {
            var sourceGroup = template[groupIndex];
            var group = new ShopChecklistGroup
            {
                ShopId = shopId,
                GroupName = sourceGroup.GroupName,
                Description = sourceGroup.Description,
                DisplayOrder = groupIndex + 1,
                IsActive = true,
                IsSystemDefault = true,
                CreatedOn = now,
                CreatedBy = createdBy
            };

            for (var taskIndex = 0; taskIndex < sourceGroup.Tasks.Length; taskIndex++)
            {
                var sourceTask = sourceGroup.Tasks[taskIndex];
                var task = new ShopChecklistTask
                {
                    ShopId = shopId,
                    ChecklistGroupId = group.Id,
                    TaskName = sourceTask.TaskName,
                    Description = sourceTask.Description,
                    DisplayOrder = taskIndex + 1,
                    IsRequired = sourceTask.IsRequired,
                    IsActive = true,
                    NotesRequiredOnComplete = sourceTask.NotesRequiredOnComplete,
                    RequiredForShopOpen = sourceTask.RequiredForShopOpen,
                    RequiredForShiftClose = sourceTask.RequiredForShiftClose,
                    RequiredForDayClose = sourceTask.RequiredForDayClose,
                    IsSystemDefault = true,
                    CreatedOn = now,
                    CreatedBy = createdBy
                };

                group.Tasks.Add(task);
            }

            groups.Add(group);
        }

        return groups.ToArray();
    }

    private static string NormalizeRequiredText(string? value, string errorMessage)
    {
        var normalized = value?.Trim() ?? string.Empty;
        if (normalized.Length == 0)
        {
            throw new AppException("validation_failed", errorMessage);
        }

        return normalized;
    }

    private static string? NormalizeOptionalText(string? value)
    {
        var normalized = value?.Trim();
        return string.IsNullOrWhiteSpace(normalized) ? null : normalized;
    }

    private sealed record ChecklistTemplateGroup(
        string GroupName,
        string? Description,
        ChecklistTemplateTask[] Tasks);

    private sealed record ChecklistTemplateTask(
        string TaskName,
        bool IsRequired,
        bool NotesRequiredOnComplete,
        bool RequiredForShopOpen,
        bool RequiredForShiftClose,
        bool RequiredForDayClose,
        string? Description = null);
}

