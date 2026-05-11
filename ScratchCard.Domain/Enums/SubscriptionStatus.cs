namespace ScratchCard.Domain.Enums;

public enum SubscriptionStatus
{
    TrialActive = 1,
    TrialExpired = 2,
    Active = 3,
    PastDue = 4,
    PaymentFailed = 5,
    Cancelled = 6,
    Expired = 7,
    Suspended = 8
}
