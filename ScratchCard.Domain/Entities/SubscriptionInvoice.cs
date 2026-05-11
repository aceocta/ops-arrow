using ScratchCard.Domain.Common;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Domain.Entities;

public class SubscriptionInvoice : AuditableEntity
{
    public Guid CompanyId { get; set; }
    public Guid CompanySubscriptionId { get; set; }
    public string InvoiceNumber { get; set; } = string.Empty;
    public BillingCycle BillingCycle { get; set; }
    public int ActiveShopCount { get; set; }
    public decimal PricePerShop { get; set; }
    public decimal SubTotalAmount { get; set; }
    public decimal DiscountAmount { get; set; }
    public decimal TaxAmount { get; set; }
    public decimal TotalAmount { get; set; }
    public InvoiceStatus Status { get; set; }
    public DateTimeOffset DueDate { get; set; }
    public DateTimeOffset? PaidOn { get; set; }

    public Company Company { get; set; } = null!;
    public CompanySubscription CompanySubscription { get; set; } = null!;
    public ICollection<SubscriptionInvoiceLine> Lines { get; set; } = new List<SubscriptionInvoiceLine>();
    public ICollection<PaymentTransaction> PaymentTransactions { get; set; } = new List<PaymentTransaction>();
}
