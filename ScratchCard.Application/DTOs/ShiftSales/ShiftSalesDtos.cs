using ScratchCard.Application.DTOs.Common;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.DTOs.ShiftSales;

public class ShiftClosePackEntryRequest
{
    public Guid PackId { get; set; }
    public string ClosingSerialNumber { get; set; } = string.Empty;
    public string? OriginalScannedSerialNumber { get; set; }
    public EntryMethod EntryMethod { get; set; }
    public string? ManualEntryReason { get; set; }
    public string? Notes { get; set; }
}

/// <summary>Upsert of a single pack's closing serial for an open shift (staging store).</summary>
public class UpsertShiftPackClosingRequest
{
    public Guid PackId { get; set; }
    public string ClosingSerialNumber { get; set; } = string.Empty;
    public string? OriginalScannedSerialNumber { get; set; }
    public EntryMethod EntryMethod { get; set; }
    public string? ManualEntryReason { get; set; }
    public string? Notes { get; set; }
}

/// <summary>A stored closing-serial entry plus the computed sold qty / sales for that pack.</summary>
public class ShiftPackClosingDto
{
    public Guid PackId { get; set; }
    public string PackNumber { get; set; } = string.Empty;
    public int? DisplayNumber { get; set; }
    public string GameName { get; set; } = string.Empty;
    public string OpeningSerialNumber { get; set; } = string.Empty;
    public string ClosingSerialNumber { get; set; } = string.Empty;
    public string? OriginalScannedSerialNumber { get; set; }
    public EntryMethod EntryMethod { get; set; }
    public string? ManualEntryReason { get; set; }
    public string? Notes { get; set; }
    public int SoldQuantity { get; set; }
    public decimal TicketPrice { get; set; }
    public decimal SalesAmount { get; set; }
    public int RemainingTickets { get; set; }
    public DateTimeOffset EnteredOn { get; set; }
}

public class FinalizeShiftRequest
{
    public string? Notes { get; set; }
    public IReadOnlyCollection<CloseAttachmentUploadRequest> Attachments { get; set; } = [];
    public string? AttachmentFileName { get; set; }
    public string? AttachmentBase64 { get; set; }
    public IReadOnlyCollection<ShiftClosePackEntryRequest> Entries { get; set; } = [];
}

public class OfflineSyncShiftCloseRequest
{
    public Guid ShiftId { get; set; }
    public Guid ShopId { get; set; }
    public DateTimeOffset LocalCreatedOn { get; set; }
    public FinalizeShiftRequest Payload { get; set; } = new();
}

public class ShiftCloseResultDto
{
    public Guid ShiftId { get; set; }
    public decimal TotalSalesAmount { get; set; }
    public decimal TotalPrizePayout { get; set; }
    public decimal ExpectedCash { get; set; }
    public decimal Difference { get; set; }
    public bool HasManualOrEditedEntries { get; set; }
    public bool MoveDayManagementToNextBusinessDate { get; set; }
    public DateOnly? NextBusinessDate { get; set; }
}

public class ShiftSalesEntryDto
{
    public Guid Id { get; set; }
    public Guid PackId { get; set; }
    public string PackNumber { get; set; } = string.Empty;
    public int? DisplayNumber { get; set; }
    public string OpeningSerialNumber { get; set; } = string.Empty;
    public string ClosingSerialNumber { get; set; } = string.Empty;
    public string? OriginalScannedSerialNumber { get; set; }
    public EntryMethod EntryMethod { get; set; }
    public int SoldQuantity { get; set; }
    public decimal TicketPrice { get; set; }
    public decimal SalesAmount { get; set; }
    public int RemainingTickets { get; set; }
    public bool IsFlaggedForReview { get; set; }
    public bool NotificationSent { get; set; }
}
