namespace ScratchCard.Application.DTOs.RefusalRegister;

public class CreateRefusalRegisterEntryRequest
{
    public Guid ShopId { get; set; }
    public DateOnly RefusalDate { get; set; }
    public TimeOnly RefusalTime { get; set; }
    public string Product { get; set; } = string.Empty;
    public string PersonDescription { get; set; } = string.Empty;
    public string? Observations { get; set; }
    public string? StaffMemberInitials { get; set; }
    public string SignatureDataUrl { get; set; } = string.Empty;
}

public class RefusalRegisterEntryDto
{
    public Guid Id { get; set; }
    public Guid ShopId { get; set; }
    public int SequenceNo { get; set; }
    public DateOnly RefusalDate { get; set; }
    public TimeOnly RefusalTime { get; set; }
    public string Product { get; set; } = string.Empty;
    public string PersonDescription { get; set; } = string.Empty;
    public string? Observations { get; set; }
    public string StaffMemberInitials { get; set; } = string.Empty;
    public string? SignatureImagePath { get; set; }
    public DateTimeOffset RecordedOn { get; set; }
    public string? RecordedByName { get; set; }
    public DateTimeOffset? ReviewedOn { get; set; }
    public Guid? ReviewedByUserId { get; set; }
    public string? ReviewedByName { get; set; }
    public string? ReviewNotes { get; set; }
    public string? ReviewSignatureImagePath { get; set; }
}

public class UpdateRefusalRegisterEntryRequest
{
    public TimeOnly RefusalTime { get; set; }
    public string Product { get; set; } = string.Empty;
    public string PersonDescription { get; set; } = string.Empty;
    public string? Observations { get; set; }
    public string? StaffMemberInitials { get; set; }
    public string? SignatureDataUrl { get; set; }
}

public class SignOffRefusalRegisterDailyRequest
{
    public Guid ShopId { get; set; }
    public DateOnly SignoffDate { get; set; }
    public string? SignedByInitials { get; set; }
    public string? Notes { get; set; }
    public string SignatureDataUrl { get; set; } = string.Empty;
}

public class ReopenRefusalRegisterDailyRequest
{
    public Guid ShopId { get; set; }
    public DateOnly SignoffDate { get; set; }
}

public class ReviewRefusalRegisterEntryRequest
{
    public string? Notes { get; set; }
    public string? SignatureDataUrl { get; set; }
}

public class ReviewRefusalRegisterEntriesRequest
{
    public Guid ShopId { get; set; }
    public IReadOnlyCollection<Guid> EntryIds { get; set; } = [];
    public string? Notes { get; set; }
    public string SignatureDataUrl { get; set; } = string.Empty;
}

public class RefusalRegisterDailySignoffDto
{
    public Guid Id { get; set; }
    public Guid ShopId { get; set; }
    public DateOnly SignoffDate { get; set; }
    public DateTimeOffset SignedOn { get; set; }
    public Guid SignedByUserId { get; set; }
    public string SignedByInitials { get; set; } = string.Empty;
    public string SignedByName { get; set; } = string.Empty;
    public string? Notes { get; set; }
    public string? SignatureImagePath { get; set; }
}

public class RefusalRegisterDailyLogDto
{
    public Guid ShopId { get; set; }
    public DateOnly Date { get; set; }
    public RefusalRegisterDailySignoffDto? Signoff { get; set; }
    public IReadOnlyCollection<RefusalRegisterEntryDto> Entries { get; set; } = [];
}
