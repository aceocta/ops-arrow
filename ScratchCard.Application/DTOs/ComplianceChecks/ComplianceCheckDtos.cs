using ScratchCard.Application.DTOs.Common;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.DTOs.ComplianceChecks;

public class ComplianceCheckGroupDto
{
    public Guid Id { get; set; }
    public Guid ShopId { get; set; }
    public ComplianceCheckFrequency Frequency { get; set; }
    public string GroupName { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int DisplayOrder { get; set; }
    public bool IsActive { get; set; }
    public bool IsSystemDefault { get; set; }
    public IReadOnlyCollection<ComplianceCheckItemDto> Items { get; set; } = [];
}

public class CreateComplianceCheckGroupRequest
{
    public Guid ShopId { get; set; }
    public ComplianceCheckFrequency Frequency { get; set; } = ComplianceCheckFrequency.Daily;
    public string GroupName { get; set; } = string.Empty;
    public string? Description { get; set; }
    public bool IsActive { get; set; } = true;
}

public class UpdateComplianceCheckGroupRequest
{
    public ComplianceCheckFrequency Frequency { get; set; } = ComplianceCheckFrequency.Daily;
    public string GroupName { get; set; } = string.Empty;
    public string? Description { get; set; }
    public bool IsActive { get; set; } = true;
}

public class ReorderComplianceCheckGroupsRequest
{
    public Guid ShopId { get; set; }
    public ComplianceCheckFrequency Frequency { get; set; } = ComplianceCheckFrequency.Daily;
    public IReadOnlyCollection<Guid> OrderedGroupIds { get; set; } = [];
}

public class ComplianceCheckItemDto
{
    public Guid Id { get; set; }
    public Guid ShopId { get; set; }
    public Guid ComplianceCheckGroupId { get; set; }
    public string GroupName { get; set; } = string.Empty;
    public ComplianceCheckFrequency Frequency { get; set; }
    public string ItemName { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int DisplayOrder { get; set; }
    public bool IsRequired { get; set; }
    public bool IsActive { get; set; }
    public bool IsSystemDefault { get; set; }
}

public class CreateComplianceCheckItemRequest
{
    public Guid ShopId { get; set; }
    public Guid ComplianceCheckGroupId { get; set; }
    public string ItemName { get; set; } = string.Empty;
    public string? Description { get; set; }
    public bool IsRequired { get; set; } = true;
    public bool IsActive { get; set; } = true;
}

public class UpdateComplianceCheckItemRequest
{
    public Guid ComplianceCheckGroupId { get; set; }
    public string ItemName { get; set; } = string.Empty;
    public string? Description { get; set; }
    public bool IsRequired { get; set; } = true;
    public bool IsActive { get; set; } = true;
}

public class ReorderComplianceCheckItemsRequest
{
    public Guid ShopId { get; set; }
    public Guid ComplianceCheckGroupId { get; set; }
    public IReadOnlyCollection<Guid> OrderedItemIds { get; set; } = [];
}

public class ComplianceCheckEntryDto
{
    public Guid Id { get; set; }
    public Guid ShopId { get; set; }
    public Guid? CompanyId { get; set; }
    public Guid ComplianceCheckItemId { get; set; }
    public ComplianceCheckFrequency Frequency { get; set; }
    public DateOnly PeriodDate { get; set; }
    public DateOnly PeriodStartDate { get; set; }
    public DateOnly PeriodEndDate { get; set; }
    public string PeriodLabel { get; set; } = string.Empty;
    public DateOnly? CheckDate { get; set; }
    public DateOnly? WeekStartDate { get; set; }
    public DateOnly? WeekEndDate { get; set; }
    public DateOnly? MonthStartDate { get; set; }
    public DateOnly? MonthEndDate { get; set; }
    public string? MonthName { get; set; }
    public int? MonthNumber { get; set; }
    public int? MonthYear { get; set; }
    public ComplianceCheckResult Result { get; set; }
    public string? Notes { get; set; }
    public string? ActionRequired { get; set; }
    public Guid? CheckedByUserId { get; set; }
    public string? CheckedByName { get; set; }
    public DateTimeOffset? CheckedOn { get; set; }
    public bool IsActionClosedOut { get; set; }
    public string? ClosedOutNotes { get; set; }
    public Guid? ClosedOutByUserId { get; set; }
    public string? ClosedOutByName { get; set; }
    public DateTimeOffset? ClosedOutOn { get; set; }
    public IReadOnlyCollection<CloseAttachmentDto> CloseAttachments { get; set; } = [];
}

public class UpsertComplianceCheckEntryRequest
{
    public Guid ShopId { get; set; }
    public Guid ComplianceCheckItemId { get; set; }
    public DateOnly Date { get; set; }
    public ComplianceCheckResult Result { get; set; }
    public string? Notes { get; set; }
    public string? ActionRequired { get; set; }
    public string? CheckedByName { get; set; }
    public IReadOnlyCollection<CloseAttachmentUploadRequest>? Attachments { get; set; }
}

public class CloseOutComplianceActionRequest
{
    public Guid ShopId { get; set; }
    public Guid EntryId { get; set; }
    public string? ClosedOutNotes { get; set; }
}

public class ComplianceCheckPeriodRowDto
{
    public ComplianceCheckItemDto Item { get; set; } = new();
    public ComplianceCheckEntryDto? Entry { get; set; }
}

public class ComplianceCheckPeriodGroupDto
{
    public ComplianceCheckGroupDto Group { get; set; } = new();
    public int CompletedCount { get; set; }
    public int TotalCount { get; set; }
    public int NonCompliantCount { get; set; }
    public IReadOnlyCollection<ComplianceCheckPeriodRowDto> Rows { get; set; } = [];
}

public class ComplianceCheckPeriodLogDto
{
    public Guid ShopId { get; set; }
    public ComplianceCheckFrequency Frequency { get; set; } = ComplianceCheckFrequency.Daily;
    public DateOnly PeriodDate { get; set; }
    public DateOnly PeriodStartDate { get; set; }
    public DateOnly PeriodEndDate { get; set; }
    public string PeriodLabel { get; set; } = string.Empty;
    public string? MonthName { get; set; }
    public int? MonthNumber { get; set; }
    public int? MonthYear { get; set; }
    public int CompletedCount { get; set; }
    public int TotalCount { get; set; }
    public int NonCompliantCount { get; set; }
    public IReadOnlyCollection<ComplianceCheckPeriodGroupDto> Groups { get; set; } = [];
}

public class ComplianceActionReportRowDto
{
    public Guid EntryId { get; set; }
    public Guid ShopId { get; set; }
    public Guid ComplianceCheckItemId { get; set; }
    public Guid ComplianceCheckGroupId { get; set; }
    public string GroupName { get; set; } = string.Empty;
    public ComplianceCheckFrequency Frequency { get; set; } = ComplianceCheckFrequency.Daily;
    public DateOnly PeriodDate { get; set; }
    public DateOnly PeriodStartDate { get; set; }
    public DateOnly PeriodEndDate { get; set; }
    public string PeriodLabel { get; set; } = string.Empty;
    public string? MonthName { get; set; }
    public int? MonthNumber { get; set; }
    public int? MonthYear { get; set; }
    public string ItemName { get; set; } = string.Empty;
    public string? Notes { get; set; }
    public string? ActionRequired { get; set; }
    public bool IsActionClosedOut { get; set; }
    public string? ClosedOutNotes { get; set; }
    public string? CheckedByName { get; set; }
    public DateTimeOffset? CheckedOn { get; set; }
    public string? ClosedOutByName { get; set; }
    public DateTimeOffset? ClosedOutOn { get; set; }
}
