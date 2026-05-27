using ScratchCard.Domain.Common;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Domain.Entities;

public class Company : AuditableEntity
{
    public string CompanyName { get; set; } = string.Empty;
    public string? RegistrationNumber { get; set; }
    public Guid? OwnerUserId { get; set; }
    public string Email { get; set; } = string.Empty;
    public string? PhoneNumber { get; set; }
    public string? AddressLine1 { get; set; }
    public string? AddressLine2 { get; set; }
    public string? City { get; set; }
    public string? PostCode { get; set; }
    public string Country { get; set; } = "UK";
    public CompanyStatus Status { get; set; } = CompanyStatus.Active;
    public bool IsActive { get; set; } = true;
    public bool IsDeleted { get; set; }

    // One Stripe Customer per company; all of this company's shop subscriptions are billed
    // against the same saved card. Lazy-created on the first checkout, persisted so subsequent
    // shops reuse it without forcing the owner to re-enter card details.
    public string? StripeCustomerId { get; set; }

    public User? OwnerUser { get; set; }
    public ICollection<Shop> Shops { get; set; } = new List<Shop>();
    public ICollection<CompanySubscription> Subscriptions { get; set; } = new List<CompanySubscription>();
    public ICollection<SubscriptionInvoice> SubscriptionInvoices { get; set; } = new List<SubscriptionInvoice>();
    public ICollection<PaymentTransaction> PaymentTransactions { get; set; } = new List<PaymentTransaction>();
    public ICollection<BillingEvent> BillingEvents { get; set; } = new List<BillingEvent>();
}
