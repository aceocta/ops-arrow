using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.DTOs.Packs;

public class PackDto
{
    public Guid Id { get; set; }
    public Guid ShopId { get; set; }
    public Guid GameId { get; set; }
    public string GameName { get; set; } = string.Empty;
    public string GameCode { get; set; } = string.Empty;
    public string PackNumber { get; set; } = string.Empty;
    public int? DisplayNumber { get; set; }
    public decimal TicketPrice { get; set; }
    public int TotalTickets { get; set; }
    public string StartSerialNumber { get; set; } = string.Empty;
    public string EndSerialNumber { get; set; } = string.Empty;
    public SellingOrder SellingOrder { get; set; }
    public string CurrentSerialNumber { get; set; } = string.Empty;
    public PackStatus Status { get; set; }
    public DateTimeOffset ReceivedDate { get; set; }
    public bool IsManuallyAdded { get; set; }
}

public class CreateManualPackRequest
{
    public Guid ShopId { get; set; }
    public Guid GameId { get; set; }
    public string PackNumber { get; set; } = string.Empty;
    public int? DisplayNumber { get; set; }
    public decimal TicketPrice { get; set; }
    public int TotalTickets { get; set; }
    public string StartSerialNumber { get; set; } = string.Empty;
    public string EndSerialNumber { get; set; } = string.Empty;
    public SellingOrder SellingOrder { get; set; }
    public string? Notes { get; set; }
    public bool ActivateOnCreate { get; set; }
}

public class ActivatePackRequest
{
    public string OpeningSerialNumber { get; set; } = string.Empty;
    public SellingOrder SellingOrder { get; set; }
}

public class UpdatePackStatusRequest
{
    public string? Notes { get; set; }
}

public class UpdatePackDetailsRequest
{
    public string PackNumber { get; set; } = string.Empty;
    public int? DisplayNumber { get; set; }
    public decimal TicketPrice { get; set; }
    public int TotalTickets { get; set; }
    public string StartSerialNumber { get; set; } = string.Empty;
    public string EndSerialNumber { get; set; } = string.Empty;
    public SellingOrder SellingOrder { get; set; }
}
