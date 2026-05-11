using ScratchCard.Domain.Common;

namespace ScratchCard.Domain.Entities;

public class SubscriptionInvoiceLine : AuditableEntity
{
    public Guid SubscriptionInvoiceId { get; set; }
    public string Description { get; set; } = string.Empty;
    public int Quantity { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal DiscountAmount { get; set; }
    public decimal LineTotal { get; set; }

    public SubscriptionInvoice SubscriptionInvoice { get; set; } = null!;
}
