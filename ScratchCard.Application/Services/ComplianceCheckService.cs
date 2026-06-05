using System.Globalization;
using System.Net;
using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Extensions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Models;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Common;
using ScratchCard.Application.DTOs.ComplianceChecks;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Entities;
using ScratchCard.Domain.Enums;
using ScratchCard.Domain.Seed;

namespace ScratchCard.Application.Services;

public class ComplianceCheckService : IComplianceCheckService
{
    // Setup (groups/items) is open to all operational roles incl. Cashier & SalesAssistant. The
    // action report / close-out checks use their own manager-only gate, so they're unaffected.
    private static readonly string[] ComplianceManagementRoles =
        [RoleNames.CompanyOwner, RoleNames.Manager, RoleNames.Cashier, RoleNames.SalesAssistant];

    private readonly IRepository<ComplianceCheckGroup> _groupRepository;
    private readonly IRepository<ComplianceCheckItem> _itemRepository;
    private readonly IRepository<ComplianceCheckEntry> _entryRepository;
    private readonly IRepository<ComplianceCheckAttachment> _attachmentRepository;
    private readonly IRepository<Shop> _shopRepository;
    private readonly IRepository<ShopUser> _shopUserRepository;
    private readonly IAttachmentStorageService _attachmentStorageService;
    private readonly IShopMembershipService _shopMembershipService;
    private readonly INotificationService _notificationService;
    private readonly IAuditService _auditService;
    private readonly ICurrentUserService _currentUserService;
    private readonly IUnitOfWork _unitOfWork;

    public ComplianceCheckService(
        IRepository<ComplianceCheckGroup> groupRepository,
        IRepository<ComplianceCheckItem> itemRepository,
        IRepository<ComplianceCheckEntry> entryRepository,
        IRepository<ComplianceCheckAttachment> attachmentRepository,
        IRepository<Shop> shopRepository,
        IRepository<ShopUser> shopUserRepository,
        IAttachmentStorageService attachmentStorageService,
        IShopMembershipService shopMembershipService,
        INotificationService notificationService,
        IAuditService auditService,
        ICurrentUserService currentUserService,
        IUnitOfWork unitOfWork)
    {
        _groupRepository = groupRepository;
        _itemRepository = itemRepository;
        _entryRepository = entryRepository;
        _attachmentRepository = attachmentRepository;
        _shopRepository = shopRepository;
        _shopUserRepository = shopUserRepository;
        _attachmentStorageService = attachmentStorageService;
        _shopMembershipService = shopMembershipService;
        _notificationService = notificationService;
        _auditService = auditService;
        _currentUserService = currentUserService;
        _unitOfWork = unitOfWork;
    }

    public async Task<IReadOnlyCollection<ComplianceCheckGroupDto>> ListConfigurationAsync(
        Guid shopId,
        ComplianceCheckFrequency? frequency = null,
        CancellationToken cancellationToken = default)
    {
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

        await _shopMembershipService.EnsureCurrentUserShopRoleAsync(group.ShopId, ComplianceManagementRoles, cancellationToken);

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

        await _shopMembershipService.EnsureCurrentUserShopRoleAsync(item.ShopId, ComplianceManagementRoles, cancellationToken);

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

        var attachmentsByEntryId = await GetAttachmentsByEntryIdAsync(
            entries.Select(x => x.Id).ToArray(),
            cancellationToken);

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
                    Entry = entryLookup.TryGetValue(item.Id, out var entry)
                        ? MapEntry(entry, attachmentsByEntryId.GetValueOrDefault(entry.Id, []))
                        : null
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

        var period = NormalizePeriod(request.Date, item.Frequency);
        var entry = await QueryEntriesForPeriod(request.ShopId, item.Frequency, period)
            .FirstOrDefaultAsync(
                x => x.ComplianceCheckItemId == request.ComplianceCheckItemId,
                cancellationToken);

        // Capture the action state before this save so we only fire the alert when an action is newly
        // OPENED (a corrective action is entered) — not when a check merely changes to non-compliant,
        // nor on later edits of an already-open action.
        var priorResult = entry?.Result;
        var priorActionRequired = entry?.ActionRequired;
        var priorClosedOut = entry?.IsActionClosedOut ?? false;

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
        var checkedByName = NormalizeOptionalText(request.CheckedByName);
        entry.CheckedByName = checkedByName ?? _currentUserService.FullName;
        entry.CheckedOn = now;

        if (result != ComplianceCheckResult.NonCompliant)
        {
            entry.IsActionClosedOut = false;
            entry.ClosedOutNotes = null;
            entry.ClosedOutByUserId = null;
            entry.ClosedOutByName = null;
            entry.ClosedOutOn = null;
        }

        var attachmentInputs = CloseAttachmentStorage.BuildInputs(
            request.Attachments,
            legacyAttachmentFileName: null,
            legacyAttachmentBase64: null);

        IReadOnlyCollection<ComplianceCheckAttachment> createdAttachments = [];
        if (attachmentInputs.Count > 0)
        {
            var savedAttachments = await CloseAttachmentStorage.SaveComplianceAttachmentsAsync(
                attachmentInputs,
                _attachmentStorageService,
                entry.ShopId,
                period.StartDate,
                item.Frequency.ToString(),
                item.ItemName,
                cancellationToken);

            if (savedAttachments.Count > 0)
            {
                var closeAttachments = savedAttachments.Select(saved => new ComplianceCheckAttachment
                {
                    ComplianceCheckEntryId = entry.Id,
                    Frequency = entry.Frequency,
                    ShopId = entry.ShopId,
                    OriginalFileName = saved.OriginalFileName,
                    StoredFileName = saved.StoredFileName,
                    StoredPath = saved.StoredPath,
                    ContentType = saved.ContentType,
                    FileSizeBytes = saved.FileSizeBytes,
                    CreatedOn = now,
                    CreatedBy = _currentUserService.UserId
                }).ToArray();

                await _attachmentRepository.AddRangeAsync(closeAttachments, cancellationToken);
                createdAttachments = closeAttachments;
            }
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(
            nameof(ComplianceCheckEntry),
            entry.Id,
            "ComplianceCheckEntrySaved",
            request.ShopId,
            reason: item.ItemName,
            cancellationToken: cancellationToken);

        var existingAttachments = await GetAttachmentsForEntryAsync(entry.Id, entry.Frequency, cancellationToken);
        var mappedAttachments = existingAttachments.Count == 0
            ? createdAttachments.Select(x => x.ToDto()).ToArray()
            : existingAttachments.Select(x => x.ToDto()).ToArray();

        // Alert ONLY on the save that actually OPENS an action: the saved check is non-compliant, has a
        // corrective action entered, and is open (not closed out) — and it wasn't already an open action
        // before. So marking non-compliant without an action does NOT notify; entering the action does.
        // Editing an already-open action or closing it does not re-notify. Best-effort; never blocks save.
        var hadOpenAction = priorResult == ComplianceCheckResult.NonCompliant
            && !string.IsNullOrWhiteSpace(priorActionRequired)
            && !priorClosedOut;
        var hasOpenAction = result == ComplianceCheckResult.NonCompliant
            && !string.IsNullOrWhiteSpace(entry.ActionRequired)
            && !entry.IsActionClosedOut;
        if (hasOpenAction && !hadOpenAction)
        {
            var attachmentsForAlert = existingAttachments.Count > 0 ? existingAttachments : createdAttachments;
            await NotifyComplianceActionRaisedAsync(entry, item, period, attachmentsForAlert, cancellationToken);
        }

        return MapEntry(entry, mappedAttachments);
    }

    // Sends the "compliance action raised" alert: email (HTML body + the check's photo attachments) to
    // every CompanyOwner/Manager on the shop, plus a short WhatsApp heads-up to their phones. Each send
    // is isolated so one failure never blocks the others or the check that triggered it.
    private async Task NotifyComplianceActionRaisedAsync(
        ComplianceCheckEntry entry,
        ComplianceCheckItem item,
        CompliancePeriod period,
        IReadOnlyCollection<ComplianceCheckAttachment> attachments,
        CancellationToken cancellationToken)
    {
        try
        {
            var shopName = await _shopRepository.Query()
                .AsNoTracking()
                .Where(x => x.Id == entry.ShopId)
                .Select(x => x.ShopName)
                .FirstOrDefaultAsync(cancellationToken) ?? "Shop";

            var groupName = item.ComplianceCheckGroup?.GroupName ?? "Compliance";
            var periodLabel = period.StartDate == period.EndDate
                ? period.StartDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)
                : $"{period.StartDate:yyyy-MM-dd} – {period.EndDate:yyyy-MM-dd}";
            var actionText = string.IsNullOrWhiteSpace(entry.ActionRequired) ? "No action detail provided." : entry.ActionRequired!;
            var checkedBy = string.IsNullOrWhiteSpace(entry.CheckedByName) ? "-" : entry.CheckedByName!;
            var subject = $"Compliance action raised - {shopName} - {item.ItemName}";

            // Read the check's stored photos into email attachments (best-effort per file).
            var emailAttachments = new List<EmailAttachment>();
            foreach (var att in attachments)
            {
                try
                {
                    var bytes = await _attachmentStorageService.ReadAsync(att.StoredPath, cancellationToken);
                    if (bytes is { Length: > 0 })
                    {
                        emailAttachments.Add(new EmailAttachment
                        {
                            FileName = string.IsNullOrWhiteSpace(att.OriginalFileName) ? att.StoredFileName : att.OriginalFileName,
                            ContentType = string.IsNullOrWhiteSpace(att.ContentType) ? "application/octet-stream" : att.ContentType,
                            Content = bytes,
                        });
                    }
                }
                catch
                {
                    // A single unreadable attachment must not stop the alert.
                }
            }

            var body = BuildComplianceActionEmailHtml(shopName, item.ItemName, groupName, periodLabel, actionText, entry.Notes, checkedBy, emailAttachments.Count);

            var emailRecipients = await _shopUserRepository.Query()
                .AsNoTracking()
                .Where(x =>
                    x.ShopId == entry.ShopId &&
                    x.IsActive &&
                    !string.IsNullOrWhiteSpace(x.User.Email) &&
                    (x.Role.Name == RoleNames.CompanyOwner || x.Role.Name == RoleNames.Manager))
                .Select(x => x.User.Email!)
                .Distinct()
                .ToListAsync(cancellationToken);

            foreach (var recipient in emailRecipients)
            {
                try
                {
                    await _notificationService.SendAsync(new NotificationMessage
                    {
                        ShopId = entry.ShopId,
                        NotificationType = NotificationType.ComplianceActionRaised,
                        Channel = NotificationChannel.Email,
                        Recipient = recipient,
                        Subject = subject,
                        Body = body,
                        IsBodyHtml = true,
                        Attachments = emailAttachments,
                        IsPriority = true,
                        RelatedEntityName = nameof(ComplianceCheckEntry),
                        RelatedEntityId = entry.Id,
                    }, cancellationToken);
                }
                catch
                {
                    // Per-recipient failure must not block the rest.
                }
            }

            // WhatsApp heads-up (text only; the photo travels with the email).
            var phoneRecipients = await _shopUserRepository.Query()
                .AsNoTracking()
                .Where(x =>
                    x.ShopId == entry.ShopId &&
                    x.IsActive &&
                    (x.Role.Name == RoleNames.CompanyOwner || x.Role.Name == RoleNames.Manager) &&
                    !string.IsNullOrWhiteSpace(x.User.PhoneNumber))
                .Select(x => x.User.PhoneNumber!)
                .Distinct()
                .ToListAsync(cancellationToken);

            if (phoneRecipients.Count > 0)
            {
                var photoNote = emailAttachments.Count > 0
                    ? $" {emailAttachments.Count} photo(s) sent to your email."
                    : string.Empty;
                var whatsAppBody =
                    $"Compliance action raised at {shopName}: \"{item.ItemName}\" ({groupName}) marked non-compliant for {periodLabel}. "
                    + $"Action required: {actionText} Checked by {checkedBy}.{photoNote}";

                foreach (var phone in phoneRecipients)
                {
                    try
                    {
                        await _notificationService.SendAsync(new NotificationMessage
                        {
                            ShopId = entry.ShopId,
                            NotificationType = NotificationType.ComplianceActionRaised,
                            Channel = NotificationChannel.WhatsApp,
                            Recipient = phone,
                            Subject = subject,
                            Body = whatsAppBody,
                            IsBodyHtml = false,
                            RelatedEntityName = nameof(ComplianceCheckEntry),
                            RelatedEntityId = entry.Id,
                        }, cancellationToken);
                    }
                    catch
                    {
                        // Per-recipient failure must not block the rest.
                    }
                }
            }
        }
        catch
        {
            // The whole alert is best-effort: a non-compliant check must still save cleanly.
        }
    }

    private static string BuildComplianceActionEmailHtml(
        string shopName,
        string itemName,
        string groupName,
        string periodLabel,
        string actionRequired,
        string? notes,
        string checkedBy,
        int photoCount)
    {
        string Enc(string? v) => WebUtility.HtmlEncode(v ?? string.Empty);
        var notesRow = string.IsNullOrWhiteSpace(notes)
            ? string.Empty
            : $"<tr><td style=\"padding:8px 0;color:#617785;font-size:13px;vertical-align:top;\">Notes</td><td style=\"padding:8px 0;color:#2b3f4a;font-size:14px;\">{Enc(notes)}</td></tr>";
        var photoRow = photoCount > 0
            ? $"<tr><td style=\"padding:8px 0;color:#617785;font-size:13px;\">Photos</td><td style=\"padding:8px 0;color:#2b3f4a;font-size:14px;\">{photoCount} attached</td></tr>"
            : string.Empty;

        return """
            <!doctype html><html lang="en"><head><meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" /></head>
            <body style="margin:0;padding:0;background:#f2f6fb;font-family:Arial,'Segoe UI',sans-serif;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f6fb;padding:28px 12px;">
                <tr><td align="center">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #d9e1ec;border-radius:14px;overflow:hidden;">
                    <tr><td style="background:#8a1c1c;padding:22px 24px;color:#ffffff;">
                      <div style="font-size:12px;letter-spacing:0.8px;text-transform:uppercase;opacity:0.85;">Ops Arrow · Compliance</div>
                      <div style="font-size:22px;line-height:28px;font-weight:700;margin-top:6px;">Compliance action raised</div>
                    </td></tr>
                    <tr><td style="padding:22px 24px;">
                      <p style="margin:0 0 16px;color:#4a5f6b;font-size:15px;line-height:22px;">A compliance check was marked <strong>non-compliant</strong> and needs a corrective action.</p>
                      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
                        <tr><td style="padding:8px 0;color:#617785;font-size:13px;width:120px;">Shop</td><td style="padding:8px 0;color:#0f3d3e;font-size:14px;font-weight:600;">__SHOP__</td></tr>
                        <tr><td style="padding:8px 0;color:#617785;font-size:13px;">Check</td><td style="padding:8px 0;color:#0f3d3e;font-size:14px;font-weight:600;">__ITEM__</td></tr>
                        <tr><td style="padding:8px 0;color:#617785;font-size:13px;">Group</td><td style="padding:8px 0;color:#2b3f4a;font-size:14px;">__GROUP__</td></tr>
                        <tr><td style="padding:8px 0;color:#617785;font-size:13px;">Period</td><td style="padding:8px 0;color:#2b3f4a;font-size:14px;">__PERIOD__</td></tr>
                        <tr><td style="padding:8px 0;color:#617785;font-size:13px;vertical-align:top;">Action required</td><td style="padding:8px 0;color:#8a1c1c;font-size:14px;font-weight:600;">__ACTION__</td></tr>
                        __NOTES__
                        <tr><td style="padding:8px 0;color:#617785;font-size:13px;">Checked by</td><td style="padding:8px 0;color:#2b3f4a;font-size:14px;">__CHECKEDBY__</td></tr>
                        __PHOTOS__
                      </table>
                    </td></tr>
                  </table>
                </td></tr>
              </table>
            </body></html>
            """
            .Replace("__SHOP__", Enc(shopName), StringComparison.Ordinal)
            .Replace("__ITEM__", Enc(itemName), StringComparison.Ordinal)
            .Replace("__GROUP__", Enc(groupName), StringComparison.Ordinal)
            .Replace("__PERIOD__", Enc(periodLabel), StringComparison.Ordinal)
            .Replace("__ACTION__", Enc(actionRequired), StringComparison.Ordinal)
            .Replace("__NOTES__", notesRow, StringComparison.Ordinal)
            .Replace("__CHECKEDBY__", Enc(checkedBy), StringComparison.Ordinal)
            .Replace("__PHOTOS__", photoRow, StringComparison.Ordinal);
    }

    public async Task<ComplianceCheckEntryDto> CloseActionAsync(
        CloseOutComplianceActionRequest request,
        CancellationToken cancellationToken = default)
    {
        if (!_currentUserService.IsInRole(RoleNames.PlatformAdmin)
            && !_currentUserService.IsOwner()
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

        var attachments = (await GetAttachmentsForEntryAsync(entry.Id, entry.Frequency, cancellationToken))
            .Select(x => x.ToDto())
            .ToArray();

        return MapEntry(entry, attachments);
    }

    public async Task<string?> GetAttachmentDataUrlAsync(Guid attachmentId, CancellationToken cancellationToken = default)
    {
        var attachment = await _attachmentRepository.Query()
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == attachmentId, cancellationToken)
            ?? throw new AppException("compliance_attachment_not_found", "Compliance attachment not found.", 404);

        return await ReadAttachmentDataUrlAsync(
            _attachmentStorageService,
            attachment.StoredPath,
            attachment.ContentType,
            cancellationToken);
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

    private async Task<Dictionary<Guid, IReadOnlyCollection<CloseAttachmentDto>>> GetAttachmentsByEntryIdAsync(
        IReadOnlyCollection<Guid> entryIds,
        CancellationToken cancellationToken)
    {
        if (entryIds.Count == 0)
        {
            return new Dictionary<Guid, IReadOnlyCollection<CloseAttachmentDto>>();
        }

        var attachments = await _attachmentRepository.Query()
            .AsNoTracking()
            .Where(x => entryIds.Contains(x.ComplianceCheckEntryId))
            .OrderByDescending(x => x.CreatedOn)
            .ToListAsync(cancellationToken);

        return attachments
            .GroupBy(x => x.ComplianceCheckEntryId)
            .ToDictionary(
                x => x.Key,
                x => (IReadOnlyCollection<CloseAttachmentDto>)x.Select(attachment => attachment.ToDto()).ToArray());
    }

    private async Task<IReadOnlyCollection<ComplianceCheckAttachment>> GetAttachmentsForEntryAsync(
        Guid entryId,
        ComplianceCheckFrequency frequency,
        CancellationToken cancellationToken)
    {
        return await _attachmentRepository.Query()
            .AsNoTracking()
            .Where(x => x.ComplianceCheckEntryId == entryId && x.Frequency == frequency)
            .OrderByDescending(x => x.CreatedOn)
            .ToArrayAsync(cancellationToken);
    }

    private static async Task<string?> ReadAttachmentDataUrlAsync(
        IAttachmentStorageService attachmentStorageService,
        string? storedPath,
        string? contentType,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(storedPath))
        {
            return null;
        }

        var bytes = await attachmentStorageService.ReadAsync(storedPath, cancellationToken);
        if (bytes is null || bytes.Length == 0)
        {
            return null;
        }

        var mimeType = string.IsNullOrWhiteSpace(contentType)
            ? ResolveAttachmentContentTypeFromExtension(Path.GetExtension(storedPath))
            : contentType.Trim();

        return $"data:{mimeType};base64,{Convert.ToBase64String(bytes)}";
    }

    private static string ResolveAttachmentContentTypeFromExtension(string? extension)
    {
        return extension?.ToLowerInvariant() switch
        {
            ".jpg" or ".jpeg" => "image/jpeg",
            ".png" => "image/png",
            ".webp" => "image/webp",
            ".gif" => "image/gif",
            ".pdf" => "application/pdf",
            ".txt" => "text/plain",
            _ => "application/octet-stream"
        };
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

    private static ComplianceCheckEntryDto MapEntry(
        ComplianceCheckEntry entry,
        IReadOnlyCollection<CloseAttachmentDto>? attachments = null)
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
            ClosedOutOn = entry.ClosedOutOn,
            CloseAttachments = attachments ?? []
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

}



