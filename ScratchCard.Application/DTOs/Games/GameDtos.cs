using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.DTOs.Games;

public class CreateGameRequest
{
    public Guid ShopId { get; set; }
    public string GameName { get; set; } = string.Empty;
    public string GameCode { get; set; } = string.Empty;
    public decimal DefaultTicketPrice { get; set; }
    public int DefaultTicketsPerPack { get; set; }
    public string DefaultStartSerialNumber { get; set; } = string.Empty;
    public string DefaultEndSerialNumber { get; set; } = string.Empty;
    public SellingOrder DefaultSellingOrder { get; set; }
    public decimal CommissionRate { get; set; }
    public bool IsActive { get; set; } = true;
}

public class UpdateGameRequest : CreateGameRequest
{
}

public class GameDto : CreateGameRequest
{
    public Guid Id { get; set; }
}
