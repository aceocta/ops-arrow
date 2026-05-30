namespace ScratchCard.Application.DTOs.VisitorLog;

public class CreateVisitorLogEntryRequest
{
    public Guid ShopId { get; set; }
    public DateOnly VisitDate { get; set; }
    public TimeOnly TimeIn { get; set; }
    public string VisitorName { get; set; } = string.Empty;
    public string? Organisation { get; set; }
    public string VisitType { get; set; } = string.Empty;
    public string? Purpose { get; set; }
    public string? HostName { get; set; }
    public string? VehicleRegistration { get; set; }

    // Required: PNG data URL captured on the device.
    public string SignatureDataUrl { get; set; } = string.Empty;
    // Optional photo (data URL) — only stored when the shop's plan includes the attachments feature.
    public string? PhotoDataUrl { get; set; }
    public string? Notes { get; set; }

    // Forecourt-only; ignored unless the shop is a fuel station.
    public string? SpaPassportRef { get; set; }
    public string? PermitToWorkRef { get; set; }
    public bool InductionAcknowledged { get; set; }
}

public class UpdateVisitorLogEntryRequest
{
    public TimeOnly TimeIn { get; set; }
    public TimeOnly? TimeOut { get; set; }
    public string VisitorName { get; set; } = string.Empty;
    public string? Organisation { get; set; }
    public string VisitType { get; set; } = string.Empty;
    public string? Purpose { get; set; }
    public string? HostName { get; set; }
    public string? VehicleRegistration { get; set; }
    public string? SignatureDataUrl { get; set; }
    public string? PhotoDataUrl { get; set; }
    public string? Notes { get; set; }
    public string? SpaPassportRef { get; set; }
    public string? PermitToWorkRef { get; set; }
    public bool InductionAcknowledged { get; set; }
}

public class VisitorLogEntryDto
{
    public Guid Id { get; set; }
    public Guid ShopId { get; set; }
    public Guid? VisitorId { get; set; }
    public int SequenceNo { get; set; }
    public DateOnly VisitDate { get; set; }
    public TimeOnly TimeIn { get; set; }
    public TimeOnly? TimeOut { get; set; }
    public bool IsOnSite { get; set; }
    public string VisitorName { get; set; } = string.Empty;
    public string? Organisation { get; set; }
    public string VisitType { get; set; } = string.Empty;
    public string? Purpose { get; set; }
    public string? HostName { get; set; }
    public string? VehicleRegistration { get; set; }
    public bool IsInspector { get; set; }
    public bool HasSignature { get; set; }
    public bool HasPhoto { get; set; }
    public string? Notes { get; set; }
    public string? SpaPassportRef { get; set; }
    public string? PermitToWorkRef { get; set; }
    public bool InductionAcknowledged { get; set; }
    public DateTimeOffset RecordedOn { get; set; }
    public string? RecordedByName { get; set; }
}

public class VisitorLogDailyLogDto
{
    public Guid ShopId { get; set; }
    public DateOnly Date { get; set; }
    public int OnSiteCount { get; set; }
    public IReadOnlyCollection<VisitorLogEntryDto> Entries { get; set; } = [];
}

/// <summary>A platform-wide organisation (company) name suggestion for the company autocomplete.</summary>
public class VisitorOrganisationDto
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public int UsageCount { get; set; }
}

/// <summary>A directory match used to auto-fill the form when a known visitor returns.</summary>
public class VisitorDirectoryDto
{
    public Guid Id { get; set; }
    public string FullName { get; set; } = string.Empty;
    public string? Organisation { get; set; }
    public string? Phone { get; set; }
    public string? DefaultVisitType { get; set; }
    public int VisitCount { get; set; }
    public DateTimeOffset? LastVisitedOn { get; set; }
}
