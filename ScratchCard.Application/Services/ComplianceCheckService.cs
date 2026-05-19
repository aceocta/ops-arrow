using System.Globalization;
using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.ComplianceChecks;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Entities;
using ScratchCard.Domain.Enums;
using ScratchCard.Domain.Seed;

namespace ScratchCard.Application.Services;

public class ComplianceCheckService : IComplianceCheckService
{
    private readonly IRepository<ComplianceCheckGroup> _groupRepository;
    private readonly IRepository<ComplianceCheckItem> _itemRepository;
    private readonly IRepository<ComplianceCheckEntry> _entryRepository;
    private readonly IRepository<Shop> _shopRepository;
    private readonly IAuditService _auditService;
    private readonly ICurrentUserService _currentUserService;
    private readonly IUnitOfWork _unitOfWork;

    public ComplianceCheckService(
        IRepository<ComplianceCheckGroup> groupRepository,
        IRepository<ComplianceCheckItem> itemRepository,
        IRepository<ComplianceCheckEntry> entryRepository,
        IRepository<Shop> shopRepository,
        IAuditService auditService,
        ICurrentUserService currentUserService,
        IUnitOfWork unitOfWork)
    {
        _groupRepository = groupRepository;
        _itemRepository = itemRepository;
        _entryRepository = entryRepository;
        _shopRepository = shopRepository;
        _auditService = auditService;
        _currentUserService = currentUserService;
        _unitOfWork = unitOfWork;
    }

    public async Task<IReadOnlyCollection<ComplianceCheckGroupDto>> ListConfigurationAsync(
        Guid shopId,
        ComplianceCheckFrequency? frequency = null,
        CancellationToken cancellationToken = default)
    {
        await EnsureDefaultTemplateAsync(shopId, cancellationToken);

        var query = _groupRepository.Query()
            .AsNoTracking()
            .Include(x => x.Items)
            .Where(x => x.ShopId == shopId && !x.IsDeleted);

        if (frequency.HasValue)
        {
            var normalized = NormalizeFrequency(frequency.Value);
            query = query.Where(x => x.Frequency == normalized);
        }

        var groups = await query
            .OrderBy(x => x.Frequency)
            .ThenBy(x => x.DisplayOrder)
            .ThenBy(x => x.GroupName)
            .ToListAsync(cancellationToken);

        return groups.Select(
                x => MapGroup(
                    x,
                    x.Items
                        .Where(item => !item.IsDeleted)
                        .OrderBy(item => item.DisplayOrder)
                        .ThenBy(item => item.ItemName)
                        .Select(item => MapItem(item, x.GroupName))
                        .ToArray()))
            .ToArray();
    }

    public async Task<ComplianceCheckGroupDto> CreateGroupAsync(
        CreateComplianceCheckGroupRequest request,
        CancellationToken cancellationToken = default)
    {
        var frequency = NormalizeFrequency(request.Frequency);
        var groupName = NormalizeRequiredText(request.GroupName, "Group name is required.");

        var duplicate = await _groupRepository.Query()
            .AsNoTracking()
            .AnyAsync(
                x => x.ShopId == request.ShopId
                     && !x.IsDeleted
                     && x.Frequency == frequency
                     && x.GroupName == groupName,
                cancellationToken);
        if (duplicate)
        {
            throw new AppException("compliance_group_duplicate", "Compliance check group already exists for this frequency.");
        }

        var nextDisplayOrder = (await _groupRepository.Query()
            .Where(x => x.ShopId == request.ShopId && !x.IsDeleted && x.Frequency == frequency)
            .Select(x => (int?)x.DisplayOrder)
            .MaxAsync(cancellationToken) ?? 0) + 1;

        var now = DateTimeOffset.UtcNow;
        var group = new ComplianceCheckGroup
        {
            ShopId = request.ShopId,
            Frequency = frequency,
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
            nameof(ComplianceCheckGroup),
            group.Id,
            "ComplianceCheckGroupCreated",
            group.ShopId,
            cancellationToken: cancellationToken);

        return MapGroup(group, []);
    }

    public async Task<ComplianceCheckGroupDto> UpdateGroupAsync(
        Guid id,
        UpdateComplianceCheckGroupRequest request,
        CancellationToken cancellationToken = default)
    {
        var group = await _groupRepository.Query()
            .Include(x => x.Items.Where(item => !item.IsDeleted))
            .FirstOrDefaultAsync(x => x.Id == id && !x.IsDeleted, cancellationToken)
            ?? throw new AppException("compliance_group_not_found", "Compliance check group not found.", 404);

        var frequency = NormalizeFrequency(request.Frequency);
        var groupName = NormalizeRequiredText(request.GroupName, "Group name is required.");

        var duplicate = await _groupRepository.Query()
            .AsNoTracking()
            .AnyAsync(
                x => x.Id != id
                     && x.ShopId == group.ShopId
                     && !x.IsDeleted
                     && x.Frequency == frequency
                     && x.GroupName == groupName,
                cancellationToken);
        if (duplicate)
        {
            throw new AppException("compliance_group_duplicate", "Compliance check group already exists for this frequency.");
        }

        var frequencyChanged = group.Frequency != frequency;
        if (frequencyChanged)
        {
            group.DisplayOrder = (await _groupRepository.Query()
                .Where(x => x.ShopId == group.ShopId && !x.IsDeleted && x.Frequency == frequency)
                .Select(x => (int?)x.DisplayOrder)
                .MaxAsync(cancellationToken) ?? 0) + 1;
        }

        group.Frequency = frequency;
        group.GroupName = groupName;
        group.Description = NormalizeOptionalText(request.Description);
        group.IsActive = request.IsActive;
        group.ModifiedOn = DateTimeOffset.UtcNow;
        group.ModifiedBy = _currentUserService.UserId;

        if (frequencyChanged)
        {
            foreach (var item in group.Items)
            {
                item.Frequency = frequency;
                item.ModifiedOn = DateTimeOffset.UtcNow;
                item.ModifiedBy = _currentUserService.UserId;
                _itemRepository.Update(item);
            }
        }

        _groupRepository.Update(group);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(
            nameof(ComplianceCheckGroup),
            group.Id,
            "ComplianceCheckGroupUpdated",
            group.ShopId,
            cancellationToken: cancellationToken);

        return MapGroup(
            group,
            group.Items
                .OrderBy(x => x.DisplayOrder)
                .ThenBy(x => x.ItemName)
                .Select(item => MapItem(item, group.GroupName))
                .ToArray());
    }

    public async Task ReorderGroupsAsync(
        ReorderComplianceCheckGroupsRequest request,
        CancellationToken cancellationToken = default)
    {
        var frequency = NormalizeFrequency(request.Frequency);
        var orderedIds = request.OrderedGroupIds
            .Where(x => x != Guid.Empty)
            .Distinct()
            .ToArray();
        if (orderedIds.Length == 0)
        {
            return;
        }

        var groups = await _groupRepository.Query()
            .Where(
                x => x.ShopId == request.ShopId
                     && !x.IsDeleted
                     && x.Frequency == frequency
                     && orderedIds.Contains(x.Id))
            .ToListAsync(cancellationToken);
        if (groups.Count != orderedIds.Length)
        {
            throw new AppException("compliance_group_reorder_invalid", "One or more compliance check groups were not found.");
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

    public async Task<IReadOnlyCollection<ComplianceCheckItemDto>> ListItemsAsync(
        Guid shopId,
        ComplianceCheckFrequency? frequency = null,
        CancellationToken cancellationToken = default)
    {
        await EnsureDefaultTemplateAsync(shopId, cancellationToken);

        var query = _itemRepository.Query()
            .AsNoTracking()
            .Include(x => x.ComplianceCheckGroup)
            .Where(x => x.ShopId == shopId && !x.IsDeleted && !x.ComplianceCheckGroup.IsDeleted);

        if (frequency.HasValue)
        {
            var normalized = NormalizeFrequency(frequency.Value);
            query = query.Where(x => x.Frequency == normalized);
        }

        var items = await query
            .OrderBy(x => x.Frequency)
            .ThenBy(x => x.ComplianceCheckGroup.DisplayOrder)
            .ThenBy(x => x.DisplayOrder)
            .ThenBy(x => x.ItemName)
            .ToListAsync(cancellationToken);

        return items.Select(x => MapItem(x, x.ComplianceCheckGroup.GroupName)).ToArray();
    }

    public async Task<ComplianceCheckItemDto> CreateItemAsync(
        CreateComplianceCheckItemRequest request,
        CancellationToken cancellationToken = default)
    {
        var group = await _groupRepository.Query()
            .AsNoTracking()
            .FirstOrDefaultAsync(
                x => x.Id == request.ComplianceCheckGroupId
                     && x.ShopId == request.ShopId
                     && !x.IsDeleted,
                cancellationToken)
            ?? throw new AppException("compliance_group_not_found", "Compliance check group not found.", 404);

        var itemName = NormalizeRequiredText(request.ItemName, "Item name is required.");

        var duplicate = await _itemRepository.Query()
            .AsNoTracking()
            .AnyAsync(
                x => x.ShopId == request.ShopId
                     && !x.IsDeleted
                     && x.ComplianceCheckGroupId == request.ComplianceCheckGroupId
                     && x.ItemName == itemName,
                cancellationToken);
        if (duplicate)
        {
            throw new AppException("compliance_item_duplicate", "Compliance check item already exists for this group.");
        }

        var nextDisplayOrder = (await _itemRepository.Query()
            .Where(x => x.ShopId == request.ShopId && !x.IsDeleted && x.ComplianceCheckGroupId == request.ComplianceCheckGroupId)
            .Select(x => (int?)x.DisplayOrder)
            .MaxAsync(cancellationToken) ?? 0) + 1;

        var now = DateTimeOffset.UtcNow;
        var item = new ComplianceCheckItem
        {
            ShopId = request.ShopId,
            ComplianceCheckGroupId = request.ComplianceCheckGroupId,
            Frequency = group.Frequency,
            ItemName = itemName,
            Description = NormalizeOptionalText(request.Description),
            DisplayOrder = nextDisplayOrder,
            IsRequired = request.IsRequired,
            IsActive = request.IsActive,
            IsSystemDefault = false,
            CreatedOn = now,
            CreatedBy = _currentUserService.UserId
        };

        await _itemRepository.AddAsync(item, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(
            nameof(ComplianceCheckItem),
            item.Id,
            "ComplianceCheckItemCreated",
            item.ShopId,
            cancellationToken: cancellationToken);

        return MapItem(item, group.GroupName);
    }

    public async Task<ComplianceCheckItemDto> UpdateItemAsync(
        Guid id,
        UpdateComplianceCheckItemRequest request,
        CancellationToken cancellationToken = default)
    {
        var item = await _itemRepository.Query()
            .Include(x => x.ComplianceCheckGroup)
            .FirstOrDefaultAsync(x => x.Id == id && !x.IsDeleted, cancellationToken)
            ?? throw new AppException("compliance_item_not_found", "Compliance check item not found.", 404);

        var targetGroup = await _groupRepository.Query()
            .AsNoTracking()
            .FirstOrDefaultAsync(
                x => x.Id == request.ComplianceCheckGroupId
                     && x.ShopId == item.ShopId
                     && !x.IsDeleted,
                cancellationToken)
            ?? throw new AppException("compliance_group_not_found", "Compliance check group not found.", 404);

        var itemName = NormalizeRequiredText(request.ItemName, "Item name is required.");

        var duplicate = await _itemRepository.Query()
            .AsNoTracking()
            .AnyAsync(
                x => x.Id != id
                     && x.ShopId == item.ShopId
                     && !x.IsDeleted
                     && x.ComplianceCheckGroupId == request.ComplianceCheckGroupId
                     && x.ItemName == itemName,
                cancellationToken);
        if (duplicate)
        {
            throw new AppException("compliance_item_duplicate", "Compliance check item already exists for this group.");
        }

        if (item.ComplianceCheckGroupId != request.ComplianceCheckGroupId)
        {
            item.DisplayOrder = (await _itemRepository.Query()
                .Where(x => x.ShopId == item.ShopId && !x.IsDeleted && x.ComplianceCheckGroupId == request.ComplianceCheckGroupId)
                .Select(x => (int?)x.DisplayOrder)
                .MaxAsync(cancellationToken) ?? 0) + 1;
        }

        item.ComplianceCheckGroupId = request.ComplianceCheckGroupId;
        item.Frequency = targetGroup.Frequency;
        item.ItemName = itemName;
        item.Description = NormalizeOptionalText(request.Description);
        item.IsRequired = request.IsRequired;
        item.IsActive = request.IsActive;
        item.ModifiedOn = DateTimeOffset.UtcNow;
        item.ModifiedBy = _currentUserService.UserId;

        _itemRepository.Update(item);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(
            nameof(ComplianceCheckItem),
            item.Id,
            "ComplianceCheckItemUpdated",
            item.ShopId,
            cancellationToken: cancellationToken);

        return MapItem(item, targetGroup.GroupName);
    }

    public async Task ReorderItemsAsync(
        ReorderComplianceCheckItemsRequest request,
        CancellationToken cancellationToken = default)
    {
        var orderedIds = request.OrderedItemIds
            .Where(x => x != Guid.Empty)
            .Distinct()
            .ToArray();
        if (orderedIds.Length == 0)
        {
            return;
        }

        var groupExists = await _groupRepository.Query()
            .AsNoTracking()
            .AnyAsync(
                x => x.Id == request.ComplianceCheckGroupId
                     && x.ShopId == request.ShopId
                     && !x.IsDeleted,
                cancellationToken);
        if (!groupExists)
        {
            throw new AppException("compliance_group_not_found", "Compliance check group not found.", 404);
        }

        var items = await _itemRepository.Query()
            .Where(
                x => x.ShopId == request.ShopId
                     && !x.IsDeleted
                     && x.ComplianceCheckGroupId == request.ComplianceCheckGroupId
                     && orderedIds.Contains(x.Id))
            .ToListAsync(cancellationToken);
        if (items.Count != orderedIds.Length)
        {
            throw new AppException("compliance_item_reorder_invalid", "One or more compliance check items were not found.");
        }

        var displayOrder = 1;
        var now = DateTimeOffset.UtcNow;
        foreach (var itemId in orderedIds)
        {
            var item = items.First(x => x.Id == itemId);
            item.DisplayOrder = displayOrder++;
            item.ModifiedOn = now;
            item.ModifiedBy = _currentUserService.UserId;
            _itemRepository.Update(item);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);
    }

    public async Task<ComplianceCheckPeriodLogDto> GetPeriodLogAsync(
        Guid shopId,
        ComplianceCheckFrequency frequency,
        DateOnly date,
        CancellationToken cancellationToken = default)
    {
        await EnsureDefaultTemplateAsync(shopId, cancellationToken);

        var normalizedFrequency = NormalizeFrequency(frequency);
        var period = NormalizePeriod(date, normalizedFrequency);

        var groups = await _groupRepository.Query()
            .AsNoTracking()
            .Where(
                x => x.ShopId == shopId
                     && !x.IsDeleted
                     && x.IsActive
                     && x.Frequency == normalizedFrequency)
            .OrderBy(x => x.DisplayOrder)
            .ThenBy(x => x.GroupName)
            .ToListAsync(cancellationToken);

        if (groups.Count == 0)
        {
            return new ComplianceCheckPeriodLogDto
            {
                ShopId = shopId,
                Frequency = normalizedFrequency,
                PeriodDate = period.PeriodDate,
                PeriodStartDate = period.StartDate,
                PeriodEndDate = period.EndDate,
                PeriodLabel = period.PeriodLabel,
                MonthName = period.MonthName,
                MonthNumber = period.MonthNumber,
                MonthYear = period.MonthYear,
                CompletedCount = 0,
                TotalCount = 0,
                NonCompliantCount = 0,
                Groups = []
            };
        }

        var groupIds = groups.Select(x => x.Id).ToArray();
        var items = await _itemRepository.Query()
            .AsNoTracking()
            .Where(
                x => x.ShopId == shopId
                     && !x.IsDeleted
                     && x.IsActive
                     && x.Frequency == normalizedFrequency
                     && groupIds.Contains(x.ComplianceCheckGroupId))
            .OrderBy(x => x.ComplianceCheckGroupId)
            .ThenBy(x => x.DisplayOrder)
            .ThenBy(x => x.ItemName)
            .ToListAsync(cancellationToken);

        if (items.Count == 0)
        {
            var emptyGroups = groups.Select(group => new ComplianceCheckPeriodGroupDto
            {
                Group = MapGroup(group, []),
                CompletedCount = 0,
                TotalCount = 0,
                NonCompliantCount = 0,
                Rows = []
            }).ToArray();

            return new ComplianceCheckPeriodLogDto
            {
                ShopId = shopId,
                Frequency = normalizedFrequency,
                PeriodDate = period.PeriodDate,
                PeriodStartDate = period.StartDate,
                PeriodEndDate = period.EndDate,
                PeriodLabel = period.PeriodLabel,
                MonthName = period.MonthName,
                MonthNumber = period.MonthNumber,
                MonthYear = period.MonthYear,
                CompletedCount = 0,
                TotalCount = 0,
                NonCompliantCount = 0,
                Groups = emptyGroups
            };
        }

        var itemIds = items.Select(x => x.Id).ToArray();
        var entries = await QueryEntriesForPeriod(shopId, itemIds, normalizedFrequency, period)
            .AsNoTracking()
            .ToListAsync(cancellationToken);

        var entryLookup = entries.ToDictionary(x => x.ComplianceCheckItemId, x => x);
        var itemsByGroup = items
            .GroupBy(x => x.ComplianceCheckGroupId)
            .ToDictionary(x => x.Key, x => x.ToArray());

        var periodGroups = new List<ComplianceCheckPeriodGroupDto>(groups.Count);
        foreach (var group in groups)
        {
            var groupItems = itemsByGroup.TryGetValue(group.Id, out var value) ? value : [];
            var rows = groupItems
                .Select(item => new ComplianceCheckPeriodRowDto
                {
                    Item = MapItem(item, group.GroupName),
                    Entry = entryLookup.TryGetValue(item.Id, out var entry) ? MapEntry(entry) : null
                })
                .ToArray();

            periodGroups.Add(new ComplianceCheckPeriodGroupDto
            {
                Group = MapGroup(group, groupItems.Select(item => MapItem(item, group.GroupName)).ToArray()),
                TotalCount = rows.Length,
                CompletedCount = rows.Count(x => x.Entry is not null && x.Entry.Result != ComplianceCheckResult.Pending),
                NonCompliantCount = rows.Count(x => x.Entry?.Result == ComplianceCheckResult.NonCompliant),
                Rows = rows
            });
        }

        return new ComplianceCheckPeriodLogDto
        {
            ShopId = shopId,
            Frequency = normalizedFrequency,
            PeriodDate = period.PeriodDate,
            PeriodStartDate = period.StartDate,
            PeriodEndDate = period.EndDate,
            PeriodLabel = period.PeriodLabel,
            MonthName = period.MonthName,
            MonthNumber = period.MonthNumber,
            MonthYear = period.MonthYear,
            TotalCount = periodGroups.Sum(x => x.TotalCount),
            CompletedCount = periodGroups.Sum(x => x.CompletedCount),
            NonCompliantCount = periodGroups.Sum(x => x.NonCompliantCount),
            Groups = periodGroups
        };
    }

    public async Task<ComplianceCheckEntryDto> UpsertEntryAsync(
        UpsertComplianceCheckEntryRequest request,
        CancellationToken cancellationToken = default)
    {
        var item = await _itemRepository.Query()
            .Include(x => x.ComplianceCheckGroup)
            .AsNoTracking()
            .FirstOrDefaultAsync(
                x => x.Id == request.ComplianceCheckItemId
                     && x.ShopId == request.ShopId
                     && !x.IsDeleted,
                cancellationToken)
            ?? throw new AppException("compliance_item_not_found", "Compliance check item not found.", 404);

        if (!item.IsActive || !item.ComplianceCheckGroup.IsActive)
        {
            throw new AppException("compliance_item_inactive", "Compliance check item is inactive.");
        }

        var result = NormalizeResult(request.Result);
        var notes = NormalizeOptionalText(request.Notes);
        var actionRequired = NormalizeOptionalText(request.ActionRequired);
        if (result == ComplianceCheckResult.NonCompliant && string.IsNullOrWhiteSpace(actionRequired))
        {
            throw new AppException("compliance_action_required", "Action required is mandatory for non-compliant checks.");
        }

        var period = NormalizePeriod(request.Date, item.Frequency);
        var entry = await QueryEntriesForPeriod(request.ShopId, item.Frequency, period)
            .FirstOrDefaultAsync(
                x => x.ComplianceCheckItemId == request.ComplianceCheckItemId,
                cancellationToken);

        var now = DateTimeOffset.UtcNow;
        var companyId = await _shopRepository.Query()
            .AsNoTracking()
            .Where(x => x.Id == request.ShopId)
            .Select(x => x.CompanyId)
            .FirstOrDefaultAsync(cancellationToken);

        if (entry is null)
        {
            entry = CreateEntryEntity(item.Frequency);
            entry.ShopId = request.ShopId;
            entry.CompanyId = companyId;
            entry.ComplianceCheckItemId = request.ComplianceCheckItemId;
            entry.Frequency = item.Frequency;
            ApplyPeriodToEntry(entry, period);
            entry.CreatedOn = now;
            entry.CreatedBy = _currentUserService.UserId;
            await _entryRepository.AddAsync(entry, cancellationToken);
        }
        else
        {
            entry.ModifiedOn = now;
            entry.ModifiedBy = _currentUserService.UserId;
            entry.CompanyId = entry.CompanyId ?? companyId;
            ApplyPeriodToEntry(entry, period);
            _entryRepository.Update(entry);
        }

        entry.Result = result;
        entry.Notes = notes;
        entry.ActionRequired = result == ComplianceCheckResult.NonCompliant ? actionRequired : null;
        entry.CheckedByUserId = _currentUserService.UserId;
        entry.CheckedByName = _currentUserService.FullName;
        entry.CheckedOn = now;

        if (result != ComplianceCheckResult.NonCompliant)
        {
            entry.IsActionClosedOut = false;
            entry.ClosedOutNotes = null;
            entry.ClosedOutByUserId = null;
            entry.ClosedOutByName = null;
            entry.ClosedOutOn = null;
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(
            nameof(ComplianceCheckEntry),
            entry.Id,
            "ComplianceCheckEntrySaved",
            request.ShopId,
            reason: item.ItemName,
            cancellationToken: cancellationToken);

        return MapEntry(entry);
    }

    public async Task<ComplianceCheckEntryDto> CloseActionAsync(
        CloseOutComplianceActionRequest request,
        CancellationToken cancellationToken = default)
    {
        if (!_currentUserService.IsInRole(RoleNames.PlatformAdmin)
            && !_currentUserService.IsInRole(RoleNames.ShopOwner)
            && !_currentUserService.IsInRole(RoleNames.Manager))
        {
            throw new AppException(ErrorCodes.UnauthorizedRole, "Only owner, admin, or manager can close actions.", 403);
        }

        var entry = await _entryRepository.Query()
            .Include(x => x.ComplianceCheckItem)
            .FirstOrDefaultAsync(x => x.Id == request.EntryId && x.ShopId == request.ShopId, cancellationToken)
            ?? throw new AppException("compliance_entry_not_found", "Compliance check entry not found.", 404);

        if (entry.Result != ComplianceCheckResult.NonCompliant)
        {
            throw new AppException("compliance_action_invalid", "Only non-compliant entries can be closed out.");
        }

        var now = DateTimeOffset.UtcNow;
        entry.IsActionClosedOut = true;
        entry.ClosedOutNotes = NormalizeOptionalText(request.ClosedOutNotes);
        entry.ClosedOutByUserId = _currentUserService.UserId;
        entry.ClosedOutByName = _currentUserService.FullName;
        entry.ClosedOutOn = now;
        entry.ModifiedOn = now;
        entry.ModifiedBy = _currentUserService.UserId;

        _entryRepository.Update(entry);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(
            nameof(ComplianceCheckEntry),
            entry.Id,
            "ComplianceCheckActionClosedOut",
            request.ShopId,
            reason: entry.ComplianceCheckItem.ItemName,
            cancellationToken: cancellationToken);

        return MapEntry(entry);
    }

    public async Task<IReadOnlyCollection<ComplianceActionReportRowDto>> GetActionReportAsync(
        Guid shopId,
        DateOnly from,
        DateOnly to,
        bool openOnly,
        CancellationToken cancellationToken = default)
    {
        if (from > to)
        {
            throw new AppException("compliance_invalid_range", "From date cannot be after to date.");
        }

        var dailyQuery = _entryRepository.Query()
            .AsNoTracking()
            .OfType<DailyComplianceCheckEntry>()
            .Include(x => x.ComplianceCheckItem)
            .ThenInclude(x => x.ComplianceCheckGroup)
            .Where(
                x => x.ShopId == shopId
                     && x.Result == ComplianceCheckResult.NonCompliant
                     && x.CheckDate >= from
                     && x.CheckDate <= to);

        var weeklyQuery = _entryRepository.Query()
            .AsNoTracking()
            .OfType<WeeklyComplianceCheckEntry>()
            .Include(x => x.ComplianceCheckItem)
            .ThenInclude(x => x.ComplianceCheckGroup)
            .Where(
                x => x.ShopId == shopId
                     && x.Result == ComplianceCheckResult.NonCompliant
                     && x.WeekStartDate >= from
                     && x.WeekStartDate <= to);

        var monthlyQuery = _entryRepository.Query()
            .AsNoTracking()
            .OfType<MonthlyComplianceCheckEntry>()
            .Include(x => x.ComplianceCheckItem)
            .ThenInclude(x => x.ComplianceCheckGroup)
            .Where(
                x => x.ShopId == shopId
                     && x.Result == ComplianceCheckResult.NonCompliant
                     && x.MonthStartDate >= from
                     && x.MonthStartDate <= to);

        if (openOnly)
        {
            dailyQuery = dailyQuery.Where(x => !x.IsActionClosedOut);
            weeklyQuery = weeklyQuery.Where(x => !x.IsActionClosedOut);
            monthlyQuery = monthlyQuery.Where(x => !x.IsActionClosedOut);
        }

        var dailyEntries = await dailyQuery.ToListAsync(cancellationToken);
        var weeklyEntries = await weeklyQuery.ToListAsync(cancellationToken);
        var monthlyEntries = await monthlyQuery.ToListAsync(cancellationToken);

        var entries = dailyEntries
            .Cast<ComplianceCheckEntry>()
            .Concat(weeklyEntries)
            .Concat(monthlyEntries)
            .OrderByDescending(x => x.PeriodStartDate)
            .ThenBy(x => x.Frequency)
            .ThenBy(x => x.ComplianceCheckItem.ComplianceCheckGroup.DisplayOrder)
            .ThenBy(x => x.ComplianceCheckItem.DisplayOrder)
            .ToList();

        return entries.Select(
                x => new ComplianceActionReportRowDto
                {
                    EntryId = x.Id,
                    ShopId = x.ShopId,
                    ComplianceCheckItemId = x.ComplianceCheckItemId,
                    ComplianceCheckGroupId = x.ComplianceCheckItem.ComplianceCheckGroupId,
                    GroupName = x.ComplianceCheckItem.ComplianceCheckGroup.GroupName,
                    Frequency = x.Frequency,
                    PeriodDate = x.PeriodDate,
                    PeriodStartDate = x.PeriodStartDate,
                    PeriodEndDate = x.PeriodEndDate,
                    PeriodLabel = x.PeriodLabel,
                    MonthName = x.MonthName,
                    MonthNumber = x.MonthNumber,
                    MonthYear = x.MonthYear,
                    ItemName = x.ComplianceCheckItem.ItemName,
                    Notes = x.Notes,
                    ActionRequired = x.ActionRequired,
                    IsActionClosedOut = x.IsActionClosedOut,
                    ClosedOutNotes = x.ClosedOutNotes,
                    CheckedByName = x.CheckedByName,
                    CheckedOn = x.CheckedOn,
                    ClosedOutByName = x.ClosedOutByName,
                    ClosedOutOn = x.ClosedOutOn
                })
            .ToArray();
    }

    private async Task EnsureDefaultTemplateAsync(Guid shopId, CancellationToken cancellationToken)
    {
        var defaults = BuildDefaultTemplateDefinitions();
        if (defaults.Length == 0)
        {
            return;
        }

        var existingGroups = await _groupRepository.Query()
            .Where(x => x.ShopId == shopId && !x.IsDeleted)
            .ToListAsync(cancellationToken);

        var existingItems = await _itemRepository.Query()
            .Where(x => x.ShopId == shopId && !x.IsDeleted)
            .ToListAsync(cancellationToken);

        var now = DateTimeOffset.UtcNow;
        var createdBy = _currentUserService.UserId;

        if (existingGroups.Count == 0 && existingItems.Count == 0)
        {
            var template = BuildTemplate(shopId, defaults, now, createdBy);
            await _groupRepository.AddRangeAsync(template.Groups, cancellationToken);
            await _itemRepository.AddRangeAsync(template.Items, cancellationToken);
            await _unitOfWork.SaveChangesAsync(cancellationToken);
            return;
        }

        var groupKeys = existingGroups
            .Select(x => BuildGroupKey(x.Frequency, x.GroupName))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var defaultsByGroup = defaults
            .GroupBy(x => BuildGroupKey(x.Frequency, x.GroupName))
            .ToDictionary(x => x.Key, x => x.First(), StringComparer.OrdinalIgnoreCase);

        var nextOrderByFrequency = existingGroups
            .GroupBy(x => x.Frequency)
            .ToDictionary(x => x.Key, x => x.Max(group => group.DisplayOrder) + 1);

        var groupsToCreate = new List<ComplianceCheckGroup>();
        foreach (var defaultGroup in defaultsByGroup.Values.OrderBy(x => x.Frequency).ThenBy(x => x.GroupSeedOrder))
        {
            var key = BuildGroupKey(defaultGroup.Frequency, defaultGroup.GroupName);
            if (groupKeys.Contains(key))
            {
                continue;
            }

            var nextOrder = nextOrderByFrequency.TryGetValue(defaultGroup.Frequency, out var value) ? value : 1;
            nextOrderByFrequency[defaultGroup.Frequency] = nextOrder + 1;

            var newGroup = new ComplianceCheckGroup
            {
                ShopId = shopId,
                Frequency = defaultGroup.Frequency,
                GroupName = defaultGroup.GroupName,
                DisplayOrder = nextOrder,
                IsActive = true,
                IsSystemDefault = true,
                CreatedOn = now,
                CreatedBy = createdBy
            };

            groupsToCreate.Add(newGroup);
            groupKeys.Add(key);
        }

        if (groupsToCreate.Count > 0)
        {
            await _groupRepository.AddRangeAsync(groupsToCreate, cancellationToken);
            existingGroups.AddRange(groupsToCreate);
        }

        var groupLookup = existingGroups
            .GroupBy(x => BuildGroupKey(x.Frequency, x.GroupName), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(x => x.Key, x => x.First(), StringComparer.OrdinalIgnoreCase);

        var groupById = existingGroups.ToDictionary(x => x.Id, x => x);
        var itemKeys = existingItems
            .Select(x =>
            {
                if (!groupById.TryGetValue(x.ComplianceCheckGroupId, out var group))
                {
                    return string.Empty;
                }

                return BuildItemKey(group.Frequency, group.GroupName, x.ItemName);
            })
            .Where(x => x.Length > 0)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var nextOrderByGroup = existingItems
            .GroupBy(x => x.ComplianceCheckGroupId)
            .ToDictionary(x => x.Key, x => x.Max(item => item.DisplayOrder) + 1);

        var itemsToCreate = new List<ComplianceCheckItem>();
        foreach (var definition in defaults.OrderBy(x => x.Frequency).ThenBy(x => x.GroupSeedOrder).ThenBy(x => x.ItemSeedOrder))
        {
            var key = BuildItemKey(definition.Frequency, definition.GroupName, definition.ItemName);
            if (itemKeys.Contains(key))
            {
                continue;
            }

            var groupKey = BuildGroupKey(definition.Frequency, definition.GroupName);
            if (!groupLookup.TryGetValue(groupKey, out var group))
            {
                continue;
            }

            var nextOrder = nextOrderByGroup.TryGetValue(group.Id, out var value) ? value : 1;
            nextOrderByGroup[group.Id] = nextOrder + 1;

            itemsToCreate.Add(new ComplianceCheckItem
            {
                ShopId = shopId,
                ComplianceCheckGroupId = group.Id,
                Frequency = definition.Frequency,
                ItemName = definition.ItemName,
                Description = definition.Description,
                DisplayOrder = nextOrder,
                IsRequired = definition.IsRequired,
                IsActive = true,
                IsSystemDefault = true,
                CreatedOn = now,
                CreatedBy = createdBy
            });
        }

        if (itemsToCreate.Count == 0 && groupsToCreate.Count == 0)
        {
            return;
        }

        if (itemsToCreate.Count > 0)
        {
            await _itemRepository.AddRangeAsync(itemsToCreate, cancellationToken);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);
    }

    private static ComplianceTemplate BuildTemplate(
        Guid shopId,
        IReadOnlyCollection<ComplianceTemplateItem> definitions,
        DateTimeOffset now,
        Guid? createdBy)
    {
        var groups = new List<ComplianceCheckGroup>();
        var items = new List<ComplianceCheckItem>();
        var groupOrderByFrequency = new Dictionary<ComplianceCheckFrequency, int>();
        var groupLookup = new Dictionary<string, ComplianceCheckGroup>(StringComparer.OrdinalIgnoreCase);
        var itemOrderByGroup = new Dictionary<Guid, int>();

        foreach (var definition in definitions.OrderBy(x => x.Frequency).ThenBy(x => x.GroupSeedOrder).ThenBy(x => x.ItemSeedOrder))
        {
            var groupKey = BuildGroupKey(definition.Frequency, definition.GroupName);
            if (!groupLookup.TryGetValue(groupKey, out var group))
            {
                var nextGroupOrder = groupOrderByFrequency.TryGetValue(definition.Frequency, out var value) ? value : 1;
                groupOrderByFrequency[definition.Frequency] = nextGroupOrder + 1;

                group = new ComplianceCheckGroup
                {
                    ShopId = shopId,
                    Frequency = definition.Frequency,
                    GroupName = definition.GroupName,
                    DisplayOrder = nextGroupOrder,
                    IsActive = true,
                    IsSystemDefault = true,
                    CreatedOn = now,
                    CreatedBy = createdBy
                };
                groups.Add(group);
                groupLookup[groupKey] = group;
            }

            var nextItemOrder = itemOrderByGroup.TryGetValue(group.Id, out var itemOrder) ? itemOrder : 1;
            itemOrderByGroup[group.Id] = nextItemOrder + 1;

            items.Add(new ComplianceCheckItem
            {
                ShopId = shopId,
                ComplianceCheckGroupId = group.Id,
                Frequency = definition.Frequency,
                ItemName = definition.ItemName,
                Description = definition.Description,
                DisplayOrder = nextItemOrder,
                IsRequired = definition.IsRequired,
                IsActive = true,
                IsSystemDefault = true,
                CreatedOn = now,
                CreatedBy = createdBy
            });
        }

        return new ComplianceTemplate(groups.ToArray(), items.ToArray());
    }

    private static ComplianceTemplateItem[] BuildDefaultTemplateDefinitions()
    {
        var groupOrderByKey = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        var nextGroupOrderByFrequency = new Dictionary<ComplianceCheckFrequency, int>();
        var itemOrderByGroupKey = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);

        var result = new List<ComplianceTemplateItem>(ComplianceCheckSeedDefaults.Definitions.Count);
        foreach (var definition in ComplianceCheckSeedDefaults.Definitions)
        {
            var groupKey = BuildGroupKey(definition.Frequency, definition.GroupName);
            if (!groupOrderByKey.TryGetValue(groupKey, out var groupOrder))
            {
                var nextOrder = nextGroupOrderByFrequency.TryGetValue(definition.Frequency, out var value) ? value : 1;
                nextGroupOrderByFrequency[definition.Frequency] = nextOrder + 1;
                groupOrder = nextOrder;
                groupOrderByKey[groupKey] = groupOrder;
            }

            var itemOrder = itemOrderByGroupKey.TryGetValue(groupKey, out var valueOrder) ? valueOrder : 1;
            itemOrderByGroupKey[groupKey] = itemOrder + 1;

            result.Add(new ComplianceTemplateItem(
                definition.Frequency,
                definition.GroupName,
                definition.ItemName,
                definition.Description,
                definition.IsRequired,
                groupOrder,
                itemOrder));
        }

        return result.ToArray();
    }

    private static ComplianceCheckFrequency NormalizeFrequency(ComplianceCheckFrequency frequency)
    {
        if (!Enum.IsDefined(frequency))
        {
            throw new AppException("validation_failed", "Invalid compliance check frequency.");
        }

        return frequency;
    }

    private static ComplianceCheckResult NormalizeResult(ComplianceCheckResult result)
    {
        if (!Enum.IsDefined(result))
        {
            throw new AppException("validation_failed", "Invalid compliance check result.");
        }

        return result;
    }

    private IQueryable<ComplianceCheckEntry> QueryEntriesForPeriod(
        Guid shopId,
        ComplianceCheckFrequency frequency,
        CompliancePeriod period)
    {
        var baseQuery = _entryRepository.Query()
            .Where(x => x.ShopId == shopId && x.Frequency == frequency);

        return frequency switch
        {
            ComplianceCheckFrequency.Daily => baseQuery
                .OfType<DailyComplianceCheckEntry>()
                .Where(x => x.CheckDate == period.StartDate),
            ComplianceCheckFrequency.Weekly => baseQuery
                .OfType<WeeklyComplianceCheckEntry>()
                .Where(x => x.WeekStartDate == period.StartDate && x.WeekEndDate == period.EndDate),
            ComplianceCheckFrequency.Monthly => baseQuery
                .OfType<MonthlyComplianceCheckEntry>()
                .Where(x => x.MonthStartDate == period.StartDate && x.MonthEndDate == period.EndDate),
            _ => throw new AppException("validation_failed", "Invalid compliance check frequency.")
        };
    }

    private IQueryable<ComplianceCheckEntry> QueryEntriesForPeriod(
        Guid shopId,
        IReadOnlyCollection<Guid> itemIds,
        ComplianceCheckFrequency frequency,
        CompliancePeriod period)
    {
        return QueryEntriesForPeriod(shopId, frequency, period)
            .Where(x => itemIds.Contains(x.ComplianceCheckItemId));
    }

    private static CompliancePeriod NormalizePeriod(DateOnly date, ComplianceCheckFrequency frequency)
    {
        return frequency switch
        {
            ComplianceCheckFrequency.Daily => new CompliancePeriod(
                frequency,
                StartDate: date,
                EndDate: date,
                MonthName: null,
                MonthNumber: null,
                MonthYear: null),
            ComplianceCheckFrequency.Weekly => BuildWeeklyPeriod(date),
            ComplianceCheckFrequency.Monthly => BuildMonthlyPeriod(date),
            _ => throw new AppException("validation_failed", "Invalid compliance check frequency.")
        };
    }

    private static CompliancePeriod BuildWeeklyPeriod(DateOnly date)
    {
        var weekStart = date.AddDays(-GetMondayOffset(date.DayOfWeek));
        var weekEnd = weekStart.AddDays(6);
        return new CompliancePeriod(
            ComplianceCheckFrequency.Weekly,
            StartDate: weekStart,
            EndDate: weekEnd,
            MonthName: null,
            MonthNumber: null,
            MonthYear: null);
    }

    private static CompliancePeriod BuildMonthlyPeriod(DateOnly date)
    {
        var monthStart = new DateOnly(date.Year, date.Month, 1);
        var monthEnd = new DateOnly(date.Year, date.Month, DateTime.DaysInMonth(date.Year, date.Month));
        var monthName = monthStart.ToString("MMMM", CultureInfo.InvariantCulture);

        return new CompliancePeriod(
            ComplianceCheckFrequency.Monthly,
            StartDate: monthStart,
            EndDate: monthEnd,
            MonthName: monthName,
            MonthNumber: date.Month,
            MonthYear: date.Year);
    }

    private static void ApplyPeriodToEntry(ComplianceCheckEntry entry, CompliancePeriod period)
    {
        switch (entry)
        {
            case DailyComplianceCheckEntry dailyEntry:
                dailyEntry.CheckDate = period.StartDate;
                break;
            case WeeklyComplianceCheckEntry weeklyEntry:
                weeklyEntry.WeekStartDate = period.StartDate;
                weeklyEntry.WeekEndDate = period.EndDate;
                break;
            case MonthlyComplianceCheckEntry monthlyEntry:
                monthlyEntry.MonthStartDate = period.StartDate;
                monthlyEntry.MonthEndDate = period.EndDate;
                monthlyEntry.MonthNameValue = period.MonthName ?? period.StartDate.ToString("MMMM", CultureInfo.InvariantCulture);
                monthlyEntry.MonthNumberValue = period.MonthNumber ?? period.StartDate.Month;
                monthlyEntry.MonthYearValue = period.MonthYear ?? period.StartDate.Year;
                break;
            default:
                throw new AppException("validation_failed", "Unsupported compliance check entry type.");
        }
    }

    private static int GetMondayOffset(DayOfWeek dayOfWeek)
    {
        return dayOfWeek == DayOfWeek.Sunday ? 6 : (int)dayOfWeek - 1;
    }

    private static string BuildGroupKey(ComplianceCheckFrequency frequency, string groupName)
    {
        return $"{frequency}:{groupName.Trim()}";
    }

    private static string BuildItemKey(ComplianceCheckFrequency frequency, string groupName, string itemName)
    {
        return $"{frequency}:{groupName.Trim()}:{itemName.Trim()}";
    }

    private static ComplianceCheckEntry CreateEntryEntity(ComplianceCheckFrequency frequency)
    {
        return frequency switch
        {
            ComplianceCheckFrequency.Daily => new DailyComplianceCheckEntry(),
            ComplianceCheckFrequency.Weekly => new WeeklyComplianceCheckEntry(),
            ComplianceCheckFrequency.Monthly => new MonthlyComplianceCheckEntry(),
            _ => throw new AppException("validation_failed", "Invalid compliance check frequency.")
        };
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

    private static ComplianceCheckGroupDto MapGroup(ComplianceCheckGroup group, IReadOnlyCollection<ComplianceCheckItemDto> items) => new()
    {
        Id = group.Id,
        ShopId = group.ShopId,
        Frequency = group.Frequency,
        GroupName = group.GroupName,
        Description = group.Description,
        DisplayOrder = group.DisplayOrder,
        IsActive = group.IsActive,
        IsSystemDefault = group.IsSystemDefault,
        Items = items
    };

    private static ComplianceCheckItemDto MapItem(ComplianceCheckItem item, string? groupName = null) => new()
    {
        Id = item.Id,
        ShopId = item.ShopId,
        ComplianceCheckGroupId = item.ComplianceCheckGroupId,
        GroupName = groupName ?? item.ComplianceCheckGroup?.GroupName ?? string.Empty,
        Frequency = item.Frequency,
        ItemName = item.ItemName,
        Description = item.Description,
        DisplayOrder = item.DisplayOrder,
        IsRequired = item.IsRequired,
        IsActive = item.IsActive,
        IsSystemDefault = item.IsSystemDefault
    };

    private static ComplianceCheckEntryDto MapEntry(ComplianceCheckEntry entry)
    {
        var dto = new ComplianceCheckEntryDto
        {
            Id = entry.Id,
            ShopId = entry.ShopId,
            CompanyId = entry.CompanyId,
            ComplianceCheckItemId = entry.ComplianceCheckItemId,
            Frequency = entry.Frequency,
            PeriodDate = entry.PeriodDate,
            PeriodStartDate = entry.PeriodStartDate,
            PeriodEndDate = entry.PeriodEndDate,
            PeriodLabel = entry.PeriodLabel,
            MonthName = entry.MonthName,
            MonthNumber = entry.MonthNumber,
            MonthYear = entry.MonthYear,
            Result = entry.Result,
            Notes = entry.Notes,
            ActionRequired = entry.ActionRequired,
            CheckedByUserId = entry.CheckedByUserId,
            CheckedByName = entry.CheckedByName,
            CheckedOn = entry.CheckedOn,
            IsActionClosedOut = entry.IsActionClosedOut,
            ClosedOutNotes = entry.ClosedOutNotes,
            ClosedOutByUserId = entry.ClosedOutByUserId,
            ClosedOutByName = entry.ClosedOutByName,
            ClosedOutOn = entry.ClosedOutOn
        };

        switch (entry)
        {
            case DailyComplianceCheckEntry dailyEntry:
                dto.CheckDate = dailyEntry.CheckDate;
                break;
            case WeeklyComplianceCheckEntry weeklyEntry:
                dto.WeekStartDate = weeklyEntry.WeekStartDate;
                dto.WeekEndDate = weeklyEntry.WeekEndDate;
                break;
            case MonthlyComplianceCheckEntry monthlyEntry:
                dto.MonthStartDate = monthlyEntry.MonthStartDate;
                dto.MonthEndDate = monthlyEntry.MonthEndDate;
                dto.MonthName = monthlyEntry.MonthNameValue;
                dto.MonthNumber = monthlyEntry.MonthNumberValue;
                dto.MonthYear = monthlyEntry.MonthYearValue;
                break;
        }

        return dto;
    }

    private readonly record struct CompliancePeriod(
        ComplianceCheckFrequency Frequency,
        DateOnly StartDate,
        DateOnly EndDate,
        string? MonthName,
        int? MonthNumber,
        int? MonthYear)
    {
        public DateOnly PeriodDate => StartDate;

        public string PeriodLabel => Frequency switch
        {
            ComplianceCheckFrequency.Daily => StartDate.ToString("yyyy-MM-dd"),
            ComplianceCheckFrequency.Weekly => $"{StartDate:yyyy-MM-dd} to {EndDate:yyyy-MM-dd}",
            ComplianceCheckFrequency.Monthly => string.IsNullOrWhiteSpace(MonthName)
                ? $"{StartDate:yyyy-MM-dd} to {EndDate:yyyy-MM-dd}"
                : $"{MonthName} {MonthYear}",
            _ => $"{StartDate:yyyy-MM-dd}"
        };
    }

    private sealed record ComplianceTemplate(
        ComplianceCheckGroup[] Groups,
        ComplianceCheckItem[] Items);

    private sealed record ComplianceTemplateItem(
        ComplianceCheckFrequency Frequency,
        string GroupName,
        string ItemName,
        string? Description,
        bool IsRequired,
        int GroupSeedOrder,
        int ItemSeedOrder);
}
