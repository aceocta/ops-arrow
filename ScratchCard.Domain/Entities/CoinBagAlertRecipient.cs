using ScratchCard.Domain.Common;

namespace ScratchCard.Domain.Entities;

/// <summary>
/// An explicit, custom recipient for a shop's coin-bag alerts (in addition to the role-based routing
/// captured by <c>ShopCoinBagConfig.AlertRecipientType</c>). A null <see cref="CoinDenominationId"/>
/// means "all denominations". Reserved for the custom-recipient option; role routing covers the MVP.
/// </summary>
public class CoinBagAlertRecipient : AuditableEntity
{
    public Guid ShopId { get; set; }
    /// <summary>Null = applies to every denomination at the shop.</summary>
    public Guid? CoinDenominationId { get; set; }
    public Guid? UserId { get; set; }
    public string? RoleName { get; set; }
    public bool IsActive { get; set; } = true;

    public Shop? Shop { get; set; }
}
