namespace ScratchCard.Domain.Enums;

public enum BillingEventType
{
    TrialStarted = 1,
    TrialExpired = 2,
    SubscriptionActivated = 3,
    SubscriptionChanged = 4,
    SubscriptionCancelled = 5,
    SubscriptionRenewed = 6,
    PaymentSucceeded = 7,
    PaymentFailed = 8,
    ShopCountChanged = 9,
    DiscountApplied = 10,
    InvoiceCreated = 11,
    SubscriptionReactivated = 12
}
