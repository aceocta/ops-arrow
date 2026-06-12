using ScratchCard.Domain.Common;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Domain.Entities;

public class ShopSubscription : AuditableEntity
{
    public Guid ShopId { get; set; }
    public Guid CompanyId { get; set; }
    public Guid? SubscriptionPlanId { get; set; }
    public SubscriptionStatus Status { get; set; }
    public BillingCycle BillingCycle { get; set; }
    public decimal Price { get; set; }
    public DateTimeOffset? TrialStartedOn { get; set; }
    public DateTimeOffset? TrialEndsOn { get; set; }
    public DateTimeOffset? CurrentPeriodStartedOn { get; set; }
    public DateTimeOffset? CurrentPeriodEndsOn { get; set; }
    public DateTimeOffset? CancelledOn { get; set; }
    public bool CancelAtPeriodEnd { get; set; }

    // Pause / resume metadata. Owner-triggered pause (Stripe pause_collection); resumes can be
    // either owner-triggered or background-auto-cancel after the 1-year cap. PausedOn drives
    // both the cap calculation and the "11-month heads-up" notification window.
    public DateTimeOffset? PausedOn { get; set; }
    public DateTimeOffset? ResumedOn { get; set; }
    /// <summary>
    /// Set when we've emailed the company owner about the pending 1-year auto-cancel. Null
    /// while no warning is needed (either not paused or still well inside the cap). Resets to
    /// null on resume so a subsequent pause cycle gets a fresh warning.
    /// </summary>
    public DateTimeOffset? PauseCapWarningSentOn { get; set; }

    /// <summary>
    /// Last trial-ending reminder threshold emailed to the company owners (7, 3 or 1 — days
    /// before <see cref="TrialEndsOn"/>). Null/0 = no reminder sent yet. The background sweep
    /// only sends when it crosses a SMALLER threshold than the one recorded here, so each
    /// stage fires at most once per trial.
    /// </summary>
    public int? TrialReminderStage { get; set; }

    // Generic provider fields kept for backwards compatibility with the IAP code path.
    public string? PaymentProvider { get; set; }
    public string? ProviderProductId { get; set; }
    public string? ProviderSubscriptionId { get; set; }
    public string? ProviderOriginalTransactionId { get; set; }

    // Dedicated Stripe identifiers so we can reconcile webhook events and call Stripe's
    // management APIs (cancel / reactivate / portal) without depending on RevenueCat
    // metadata. Populated when the RevenueCat webhook surfaces them or by a direct
    // Stripe webhook in future.
    public string? StripeCustomerId { get; set; }
    public string? StripeSubscriptionId { get; set; }

    public Shop Shop { get; set; } = null!;
    public Company Company { get; set; } = null!;
    public SubscriptionPlan? SubscriptionPlan { get; set; }
}
