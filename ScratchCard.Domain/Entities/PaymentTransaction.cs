using ScratchCard.Domain.Common;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Domain.Entities;

public class PaymentTransaction : AuditableEntity
{
    public Guid CompanyId { get; set; }
    public Guid CompanySubscriptionId { get; set; }
    public Guid? SubscriptionInvoiceId { get; set; }
    public string PaymentProvider { get; set; } = string.Empty;
    public string? ProviderTransactionId { get; set; }
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "GBP";
    public PaymentStatus Status { get; set; }
    public DateTimeOffset? PaidOn { get; set; }
    public string? FailedReason { get; set; }
    public string? RawProviderResponse { get; set; }

    public Company Company { get; set; } = null!;
    public CompanySubscription CompanySubscription { get; set; } = null!;
    public SubscriptionInvoice? SubscriptionInvoice { get; set; }
}
