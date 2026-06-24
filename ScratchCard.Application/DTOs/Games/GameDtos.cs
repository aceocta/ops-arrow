using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.DTOs.Games;

// Whether a created/assigned game is linked to just the current shop or to every shop in the company.
public enum GameAssignScope
{
    Shop = 0,
    Company = 1,
}

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
    // Creator's choice: assign the new pending game to just this shop, or to all the company's shops.
    public GameAssignScope AssignScope { get; set; } = GameAssignScope.Shop;
}

public class UpdateGameRequest : CreateGameRequest
{
}

public class GameDto : CreateGameRequest
{
    public Guid Id { get; set; }
    public Guid MasterGameId { get; set; }
    public ApprovalStatus ApprovalStatus { get; set; }
}

// Returned by Create: either the new game, or a signal that the code already exists so the app can
// prompt the user to assign the existing game instead of silently creating a duplicate.
public class CreateGameResult
{
    public string Outcome { get; set; } = "Created"; // "Created" | "DuplicateExists"
    public GameDto? Game { get; set; }
    public DuplicateGameInfo? Duplicate { get; set; }
}

public class DuplicateGameInfo
{
    public Guid MasterGameId { get; set; }
    public string GameName { get; set; } = string.Empty;
    public string GameCode { get; set; } = string.Empty;
    public ApprovalStatus ApprovalStatus { get; set; }
    public bool AlreadyAssignedToShop { get; set; }
}

// Used by the duplicate prompt to link the existing master game to the chosen scope.
public class AssignExistingGameRequest
{
    public Guid MasterGameId { get; set; }
    public Guid ShopId { get; set; }
    public GameAssignScope Scope { get; set; } = GameAssignScope.Shop;
    public string DefaultStartSerialNumber { get; set; } = string.Empty;
    public string DefaultEndSerialNumber { get; set; } = string.Empty;
    public SellingOrder DefaultSellingOrder { get; set; }
    public bool IsActive { get; set; } = true;
}

public class RejectGameRequest
{
    public string? Reason { get; set; }
}

// One pending master game for the PlatformAdmin approval queue.
public class PendingGameDto
{
    public Guid MasterGameId { get; set; }
    public string GameName { get; set; } = string.Empty;
    public string GameCode { get; set; } = string.Empty;
    public decimal TicketPrice { get; set; }
    public int TicketsPerPack { get; set; }
    public Guid? OriginShopId { get; set; }
    public string? OriginShopName { get; set; }
    public Guid? OriginCompanyId { get; set; }
    public string? OriginCompanyName { get; set; }
    public int AssignedShopCount { get; set; }
    public DateTimeOffset CreatedOn { get; set; }
}
