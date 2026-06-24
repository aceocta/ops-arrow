using ScratchCard.Domain.Common;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Domain.Entities;

public class ScratchCardGame : SoftDeletableAuditableEntity
{
    public string GameName { get; set; } = string.Empty;
    public string GameCode { get; set; } = string.Empty;
    public decimal TicketPrice { get; set; }
    public int TicketsPerPack { get; set; }
    public bool IsActive { get; set; } = true;

    // Approval workflow: a manager/owner creates a game as Pending — usable only by the shop(s) it
    // was assigned to. A PlatformAdmin then approves it, making it a global catalogue game any shop
    // can opt into. Existing games are backfilled to Approved by the migration.
    public ApprovalStatus ApprovalStatus { get; set; } = ApprovalStatus.Pending;
    // Where the game was first created — used to scope visibility of a still-pending game.
    public Guid? OriginShopId { get; set; }
    public Guid? OriginCompanyId { get; set; }
    public Guid? ApprovedByUserId { get; set; }
    public DateTimeOffset? ApprovedOn { get; set; }
    public string? RejectionReason { get; set; }

    public ICollection<ShopScratchCardGame> ShopScratchCardGames { get; set; } = new List<ShopScratchCardGame>();
    public ICollection<ScratchCardPack> ScratchCardPacks { get; set; } = new List<ScratchCardPack>();
}
