using ScratchCard.Domain.Common;
namespace ScratchCard.Domain.Entities;

public class ScratchCardGame : SoftDeletableAuditableEntity
{
    public string GameName { get; set; } = string.Empty;
    public string GameCode { get; set; } = string.Empty;
    public decimal TicketPrice { get; set; }
    public int TicketsPerPack { get; set; }
    public bool IsActive { get; set; } = true;

    public ICollection<ShopScratchCardGame> ShopScratchCardGames { get; set; } = new List<ShopScratchCardGame>();
    public ICollection<ScratchCardPack> ScratchCardPacks { get; set; } = new List<ScratchCardPack>();
}
