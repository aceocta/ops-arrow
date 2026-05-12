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

public class FinalizeShiftRequest
{
    public decimal ActualCash { get; set; }
    public string? Notes { get; set; }
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
    public decimal ActualCash { get; set; }
    public decimal Difference { get; set; }
    public bool HasManualOrEditedEntries { get; set; }
}

public class ShiftSalesEntryDto
{
    public Guid Id { get; set; }
    public Guid PackId { get; set; }
    public string PackNumber { get; set; } = string.Empty;
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
