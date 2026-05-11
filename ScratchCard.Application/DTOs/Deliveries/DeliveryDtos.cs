using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.DTOs.Deliveries;

public class CreateDeliveryRequest
{
    public Guid ShopId { get; set; }
    public DateTimeOffset DeliveryDate { get; set; }
    public string SupplierName { get; set; } = string.Empty;
    public string DeliveryReference { get; set; } = string.Empty;
    public Guid ReceivedByUserId { get; set; }
    public string? Notes { get; set; }
    public bool AllowAutoCreateGames { get; set; }
    public IReadOnlyCollection<CreateDeliveryPackRequest> Packs { get; set; } = [];
}

public class CreateDeliveryPackRequest
{
    public Guid? GameId { get; set; }
    public string? GameCode { get; set; }
    public string? GameName { get; set; }
    public string PackNumber { get; set; } = string.Empty;
    public int? DisplayNumber { get; set; }
    public decimal TicketPrice { get; set; }
    public int TotalTickets { get; set; }
    public string StartSerialNumber { get; set; } = string.Empty;
    public string EndSerialNumber { get; set; } = string.Empty;
    public SellingOrder SellingOrder { get; set; }
    public string? Notes { get; set; }
}

public class DeliveryDto
{
    public Guid Id { get; set; }
    public Guid ShopId { get; set; }
    public DateTimeOffset DeliveryDate { get; set; }
    public string SupplierName { get; set; } = string.Empty;
    public string DeliveryReference { get; set; } = string.Empty;
    public string? Notes { get; set; }
    public IReadOnlyCollection<DeliveryPackDto> Packs { get; set; } = [];
}

public class DeliveryPackDto
{
    public Guid PackId { get; set; }
    public string PackNumber { get; set; } = string.Empty;
    public string GameName { get; set; } = string.Empty;
}

public class ParseDeliveryNoteRequest
{
    public Guid ShopId { get; set; }
    public byte[] ImageBytes { get; set; } = [];
    public string ContentType { get; set; } = "image/jpeg";
    public string FileName { get; set; } = "delivery-note.jpg";
}

public class ParseDeliveryNoteResponse
{
    public string SupplierName { get; set; } = string.Empty;
    public string DeliveryReference { get; set; } = string.Empty;
    public string ShipmentNumber { get; set; } = string.Empty;
    public string DeliveryDate { get; set; } = string.Empty;
    public IReadOnlyCollection<DeliveryNotePackSuggestionDto> PackSuggestions { get; set; } = [];
    public IReadOnlyCollection<string> Warnings { get; set; } = [];
}

public class DeliveryNotePackSuggestionDto
{
    public string GameCode { get; set; } = string.Empty;
    public string PackNumber { get; set; } = string.Empty;
    public string RawText { get; set; } = string.Empty;
    public decimal Confidence { get; set; }
    public Guid? GameId { get; set; }
    public string? GameName { get; set; }
    public decimal? TicketPrice { get; set; }
    public int? TotalTickets { get; set; }
    public string? StartSerialNumber { get; set; }
    public string? EndSerialNumber { get; set; }
    public SellingOrder? SellingOrder { get; set; }
    public bool IsNewGameCandidate { get; set; }
    public bool IsDuplicateInImage { get; set; }
    public bool ExistsInSystem { get; set; }
}
