using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Models;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Subscriptions;
using ScratchCard.Domain.Entities;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.Services;

public class ShopSubscriptionService : IShopSubscriptionService
{
    // Final fallback used only when neither the plan nor the global CfgSubscriptionSettings
    // has been configured. Set the global default via the admin endpoint so this constant
    // never actually kicks in.
    private const int HardcodedTrialDaysFallback = 14;

    private readonly IRepository<Shop> _shopRepository;
    private readonly IRepository<Company> _companyRepository;
    private readonly IRepository<ShopSubscription> _shopSubscriptionRepository;
    private readonly IRepository<SubscriptionPlan> _planRepository;
    private readonly IRepository<BillingEvent> _billingEventRepository;
    private readonly IRepository<CfgSubscriptionSettings> _subscriptionSettingsRepository;
    private readonly IBillingCheckoutService _billingCheckoutService;
    private readonly IEmailSender _emailSender;
    private readonly ICurrentUserService _currentUserService;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ILogger<ShopSubscriptionService> _logger;

    public ShopSubscriptionService(
        IRepository<Shop> shopRepository,
        IRepository<Company> companyRepository,
        IRepository<ShopSubscription> shopSubscriptionRepository,
        IRepository<SubscriptionPlan> planRepository,
        IRepository<BillingEvent> billingEventRepository,
        IRepository<CfgSubscriptionSettings> subscriptionSettingsRepository,
        IBillingCheckoutService billingCheckoutService,
        IEmailSender emailSender,
        ICurrentUserService currentUserService,
        IUnitOfWork unitOfWork,
        ILogger<ShopSubscriptionService> logger)
    {
        _shopRepository = shopRepository;
        _companyRepository = companyRepository;
        _shopSubscriptionRepository = shopSubscriptionRepository;
        _planRepository = planRepository;
        _billingEventRepository = billingEventRepository;
        _subscriptionSettingsRepository = subscriptionSettingsRepository;
        _billingCheckoutService = billingCheckoutService;
        _emailSender = emailSender;
        _currentUserService = currentUserService;
        _unitOfWork = unitOfWork;
        _logger = logger;
    }

    public async Task<ShopSubscriptionSummaryDto> EnsureTrialAsync(Guid shopId, Guid? intendedPlanId = null, CancellationToken cancellationToken = default)
    {
        var existing = await _shopSubscriptionRepository.Query()
            .Where(x => x.ShopId == shopId)
            .OrderByDescending(x => x.CreatedOn)
            .FirstOrDefaultAsync(cancellationToken);

        if (existing is not null)
        {
            return await BuildSummaryAsync(existing, cancellationToken);
        }

        var shop = await _shopRepository.GetByIdAsync(shopId, cancellationToken)
            ?? throw new AppException("shop_not_found", "Shop not found.", 404);

        if (shop.CompanyId is null)
        {
            throw new AppException("validation_failed", "Shop is not associated with a company.", 400);
        }

        // The owner picks the plan they intend to subscribe to at shop-creation time. We start the
        // shop on a free trial referencing that plan so the user knows what they'll be charged at
        // conversion. If no plan is supplied we fall back to a generic trial plan.
        var intendedPlan = intendedPlanId.HasValue
            ? await _planRepository.GetByIdAsync(intendedPlanId.Value, cancellationToken)
            : null;
        var trialPlan = await ResolveTrialPlanAsync(cancellationToken);

        var planForRecord = intendedPlan ?? trialPlan;
        var trialDays = await ResolveTrialDaysAsync(intendedPlan, trialPlan, cancellationToken);
        var now = DateTimeOffset.UtcNow;

        var subscription = new ShopSubscription
        {
            Id = Guid.NewGuid(),
            ShopId = shop.Id,
            CompanyId = shop.CompanyId.Value,
            SubscriptionPlanId = planForRecord?.Id,
            Status = SubscriptionStatus.TrialActive,
            BillingCycle = planForRecord?.BillingCycle ?? BillingCycle.Trial,
            Price = 0m,
            TrialStartedOn = now,
            TrialEndsOn = now.AddDays(trialDays),
            CreatedOn = now,
            CreatedBy = _currentUserService.UserId,
        };

        await _shopSubscriptionRepository.AddAsync(subscription, cancellationToken);

        var billingEvent = new BillingEvent
        {
            Id = Guid.NewGuid(),
            CompanyId = shop.CompanyId.Value,
            EventType = BillingEventType.TrialStarted,
            Description = intendedPlan is not null
                ? $"Trial started for shop {shop.ShopName} (intended plan: {intendedPlan.Name})."
                : $"Trial started for shop {shop.ShopName}.",
        };
        await _billingEventRepository.AddAsync(billingEvent, cancellationToken);

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return await BuildSummaryAsync(subscription, cancellationToken);
    }

    public async Task<ShopSubscriptionSummaryDto?> GetSummaryAsync(Guid shopId, CancellationToken cancellationToken = default)
    {
        // Pure read: no side-effects. If a shop has never had a subscription row created the
        // caller (mobile or admin) is responsible for explicitly starting a trial via
        // EnsureTrialAsync. This makes the endpoint safe to poll and makes deletes of broken
        // subscriptions actually stick.
        var subscription = await _shopSubscriptionRepository.Query()
            .Where(x => x.ShopId == shopId)
            .OrderByDescending(x => x.CreatedOn)
            .FirstOrDefaultAsync(cancellationToken);

        return subscription is null ? null : await BuildSummaryAsync(subscription, cancellationToken);
    }

    public async Task<ShopEntitlementsDto> GetEntitlementsAsync(Guid shopId, CancellationToken cancellationToken = default)
    {
        var summary = await GetSummaryAsync(shopId, cancellationToken);
        if (summary is null)
        {
            return new ShopEntitlementsDto
            {
                ShopId = shopId,
                Status = SubscriptionStatus.Expired,
                IsActive = false,
                IsInTrial = false,
                InGracePeriod = false,
                Features = Array.Empty<string>(),
            };
        }

        var isInTrial = summary.Status == SubscriptionStatus.TrialActive || (summary.TrialDaysRemaining ?? 0) > 0;
        var isActive = summary.Status == SubscriptionStatus.Active || isInTrial;
        var inGracePeriod = summary.Status == SubscriptionStatus.PastDue || summary.Status == SubscriptionStatus.PaymentFailed;
        var expiresAt = summary.CurrentPeriodEndsOn ?? summary.TrialEndsOn;

        return new ShopEntitlementsDto
        {
            ShopId = summary.ShopId,
            CompanyId = summary.CompanyId,
            Tier = summary.PlanName,
            Status = summary.Status,
            IsActive = isActive,
            IsInTrial = isInTrial,
            InGracePeriod = inGracePeriod,
            TrialDaysRemaining = summary.TrialDaysRemaining,
            ExpiresAt = expiresAt,
            Features = summary.IncludedFeatures,
            MaxUsers = summary.MaxUsers,
            ReportExportsPerMonth = summary.ReportExportsPerMonth,
        };
    }

    public async Task<ShopSubscriptionSummaryDto> SelectPlanAsync(SelectShopSubscriptionPlanRequest request, CancellationToken cancellationToken = default)
    {
        if (request.ShopId == Guid.Empty || request.PlanId == Guid.Empty)
        {
            throw new AppException("validation_failed", "ShopId and PlanId are required.", 400);
        }

        var plan = await _planRepository.GetByIdAsync(request.PlanId, cancellationToken)
            ?? throw new AppException("plan_not_found", "Subscription plan not found.", 404);

        var shop = await _shopRepository.GetByIdAsync(request.ShopId, cancellationToken)
            ?? throw new AppException("shop_not_found", "Shop not found.", 404);

        if (shop.CompanyId is null)
        {
            throw new AppException("validation_failed", "Shop is not associated with a company.", 400);
        }

        var subscription = await _shopSubscriptionRepository.Query()
            .Where(x => x.ShopId == request.ShopId)
            .OrderByDescending(x => x.CreatedOn)
            .FirstOrDefaultAsync(cancellationToken);

        var now = DateTimeOffset.UtcNow;

        if (subscription is null)
        {
            subscription = new ShopSubscription
            {
                Id = Guid.NewGuid(),
                ShopId = shop.Id,
                CompanyId = shop.CompanyId.Value,
                CreatedOn = now,
                CreatedBy = _currentUserService.UserId,
            };
            await _shopSubscriptionRepository.AddAsync(subscription, cancellationToken);
        }
        else
        {
            subscription.ModifiedOn = now;
            subscription.ModifiedBy = _currentUserService.UserId;
        }

        subscription.SubscriptionPlanId = plan.Id;
        subscription.BillingCycle = plan.BillingCycle;
        subscription.Price = plan.PricePerShop;
        // Plan selected on the client; activation is finalised when the Stripe webhook fires.
        // Until then keep the existing status so trials still count down and gating remains
        // correct.
        if (subscription.Status == default)
        {
            var trialDays = await ResolveTrialDaysAsync(plan, null, cancellationToken);
            subscription.Status = SubscriptionStatus.TrialActive;
            subscription.TrialStartedOn = now;
            subscription.TrialEndsOn = now.AddDays(trialDays);
        }

        var billingEvent = new BillingEvent
        {
            Id = Guid.NewGuid(),
            CompanyId = shop.CompanyId.Value,
            EventType = BillingEventType.SubscriptionChanged,
            Description = $"Shop {shop.ShopName} selected plan {plan.Name}.",
            NewValue = plan.Name,
        };
        await _billingEventRepository.AddAsync(billingEvent, cancellationToken);

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return await BuildSummaryAsync(subscription, cancellationToken);
    }

    public async Task<ShopSubscriptionSummaryDto> CancelAsync(Guid shopId, bool cancelAtPeriodEnd, CancellationToken cancellationToken = default)
    {
        var subscription = await _shopSubscriptionRepository.Query()
            .Where(x => x.ShopId == shopId)
            .OrderByDescending(x => x.CreatedOn)
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new AppException("subscription_not_found", "No subscription exists for this shop.", 404);

        // Tell Stripe first — a failed network call must not leave a divergent "cancelled
        // locally, still billing in Stripe" state. The webhook will reconcile timestamps when
        // the cancellation actually takes effect.
        if (!string.IsNullOrWhiteSpace(subscription.StripeSubscriptionId))
        {
            await _billingCheckoutService.CancelSubscriptionAsync(subscription.StripeSubscriptionId, cancelAtPeriodEnd, cancellationToken);
        }
        else
        {
            _logger.LogWarning(
                "Cancel called for shop {ShopId} but no Stripe subscription id is stored. Local row updated only.",
                shopId);
        }

        var now = DateTimeOffset.UtcNow;
        subscription.CancelAtPeriodEnd = cancelAtPeriodEnd;
        if (!cancelAtPeriodEnd)
        {
            subscription.Status = SubscriptionStatus.Cancelled;
            subscription.CancelledOn = now;
        }
        subscription.ModifiedOn = now;
        subscription.ModifiedBy = _currentUserService.UserId;

        await _billingEventRepository.AddAsync(new BillingEvent
        {
            Id = Guid.NewGuid(),
            CompanyId = subscription.CompanyId,
            EventType = BillingEventType.SubscriptionCancelled,
            Description = cancelAtPeriodEnd
                ? "Cancellation scheduled at period end."
                : "Subscription cancelled immediately.",
        }, cancellationToken);

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return await BuildSummaryAsync(subscription, cancellationToken);
    }

    public async Task<ShopSubscriptionSummaryDto> ReactivateAsync(Guid shopId, CancellationToken cancellationToken = default)
    {
        var subscription = await _shopSubscriptionRepository.Query()
            .Where(x => x.ShopId == shopId)
            .OrderByDescending(x => x.CreatedOn)
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new AppException("subscription_not_found", "No subscription exists for this shop.", 404);

        if (!string.IsNullOrWhiteSpace(subscription.StripeSubscriptionId))
        {
            await _billingCheckoutService.ReactivateSubscriptionAsync(subscription.StripeSubscriptionId, cancellationToken);
        }
        else
        {
            _logger.LogWarning(
                "Reactivate called for shop {ShopId} but no Stripe subscription id is stored. Local row updated only.",
                shopId);
        }

        var now = DateTimeOffset.UtcNow;
        subscription.CancelAtPeriodEnd = false;
        subscription.CancelledOn = null;
        if (subscription.Status == SubscriptionStatus.Cancelled)
        {
            subscription.Status = subscription.CurrentPeriodEndsOn.HasValue && subscription.CurrentPeriodEndsOn.Value > now
                ? SubscriptionStatus.Active
                : SubscriptionStatus.TrialExpired;
        }
        subscription.ModifiedOn = now;
        subscription.ModifiedBy = _currentUserService.UserId;

        await _billingEventRepository.AddAsync(new BillingEvent
        {
            Id = Guid.NewGuid(),
            CompanyId = subscription.CompanyId,
            EventType = BillingEventType.SubscriptionReactivated,
            Description = "Subscription reactivated.",
        }, cancellationToken);

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return await BuildSummaryAsync(subscription, cancellationToken);
    }

    public async Task<ShopSubscriptionSummaryDto> PauseAsync(Guid shopId, CancellationToken cancellationToken = default)
    {
        var shop = await _shopRepository.GetByIdAsync(shopId, cancellationToken)
            ?? throw new AppException("shop_not_found", "Shop not found.", 404);

        var subscription = await _shopSubscriptionRepository.Query()
            .Where(x => x.ShopId == shopId)
            .OrderByDescending(x => x.CreatedOn)
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new AppException("subscription_not_found", "No subscription exists for this shop.", 404);

        if (subscription.Status == SubscriptionStatus.Suspended)
        {
            // Idempotent: already paused, just return the current state.
            return await BuildSummaryAsync(subscription, cancellationToken);
        }

        // Owner can pause during a trial — there's no Stripe subscription yet, so just flip the
        // local state. The remaining trial days are preserved (TrialEndsOn is left untouched);
        // when they resume we check whether the trial has effectively expired and act
        // accordingly.
        if (!string.IsNullOrWhiteSpace(subscription.StripeSubscriptionId))
        {
            await _billingCheckoutService.PauseSubscriptionAsync(subscription.StripeSubscriptionId, cancellationToken);
        }

        var now = DateTimeOffset.UtcNow;
        subscription.Status = SubscriptionStatus.Suspended;
        subscription.PausedOn = now;
        subscription.ResumedOn = null;
        subscription.ModifiedOn = now;
        subscription.ModifiedBy = _currentUserService.UserId;

        shop.IsActive = false;
        shop.ModifiedOn = now;
        shop.ModifiedBy = _currentUserService.UserId;

        await _billingEventRepository.AddAsync(new BillingEvent
        {
            Id = Guid.NewGuid(),
            CompanyId = subscription.CompanyId,
            EventType = BillingEventType.SubscriptionChanged,
            Description = $"Shop {shop.ShopName} paused by owner.",
        }, cancellationToken);

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return await BuildSummaryAsync(subscription, cancellationToken);
    }

    public async Task<ShopSubscriptionSummaryDto> ResumeAsync(Guid shopId, CancellationToken cancellationToken = default)
    {
        var shop = await _shopRepository.GetByIdAsync(shopId, cancellationToken)
            ?? throw new AppException("shop_not_found", "Shop not found.", 404);

        var subscription = await _shopSubscriptionRepository.Query()
            .Where(x => x.ShopId == shopId)
            .OrderByDescending(x => x.CreatedOn)
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new AppException("subscription_not_found", "No subscription exists for this shop.", 404);

        if (subscription.Status != SubscriptionStatus.Suspended)
        {
            // Idempotent: nothing to resume.
            return await BuildSummaryAsync(subscription, cancellationToken);
        }

        if (!string.IsNullOrWhiteSpace(subscription.StripeSubscriptionId))
        {
            try
            {
                await _billingCheckoutService.ResumeSubscriptionAsync(subscription.StripeSubscriptionId, cancellationToken);
            }
            catch (AppException ex) when (ex.StatusCode == 502)
            {
                // Stripe rejected the resume — most commonly because the subscription has been
                // fully cancelled (auto-cancel at the 1-year cap, or admin action). Flip to
                // Cancelled locally and tell the mobile app to send the owner to Choose Plan.
                _logger.LogWarning(
                    "Resume rejected by Stripe for shop {ShopId} ({StripeSubId}). Flipping local state to Cancelled.",
                    shopId, subscription.StripeSubscriptionId);

                subscription.Status = SubscriptionStatus.Cancelled;
                subscription.CancelledOn = DateTimeOffset.UtcNow;
                subscription.ModifiedOn = DateTimeOffset.UtcNow;
                subscription.ModifiedBy = _currentUserService.UserId;
                await _unitOfWork.SaveChangesAsync(cancellationToken);

                throw new AppException(
                    "subscription_expired",
                    "This shop's subscription has been cancelled and can't be resumed. Please subscribe again.",
                    409);
            }
        }

        var now = DateTimeOffset.UtcNow;

        // Trial-time resume: if the trial would already have expired by now, don't restart it.
        // Owners shouldn't be able to extend a trial by pausing it. The TrialEndsOn is the
        // ORIGINAL trial end — we haven't been counting down during pause.
        if (subscription.TrialEndsOn.HasValue && subscription.TrialStartedOn.HasValue
            && subscription.CurrentPeriodStartedOn is null) // hasn't paid yet → still in trial state
        {
            subscription.Status = subscription.TrialEndsOn.Value > now
                ? SubscriptionStatus.TrialActive
                : SubscriptionStatus.TrialExpired;
        }
        else
        {
            subscription.Status = SubscriptionStatus.Active;
        }

        subscription.ResumedOn = now;
        subscription.PausedOn = null;
        // Clear so a subsequent pause cycle gets a fresh 11-month heads-up if needed.
        subscription.PauseCapWarningSentOn = null;
        subscription.ModifiedOn = now;
        subscription.ModifiedBy = _currentUserService.UserId;

        shop.IsActive = true;
        shop.ModifiedOn = now;
        shop.ModifiedBy = _currentUserService.UserId;

        await _billingEventRepository.AddAsync(new BillingEvent
        {
            Id = Guid.NewGuid(),
            CompanyId = subscription.CompanyId,
            EventType = BillingEventType.SubscriptionReactivated,
            Description = $"Shop {shop.ShopName} resumed by owner.",
        }, cancellationToken);

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return await BuildSummaryAsync(subscription, cancellationToken);
    }

    public async Task<ShopSubscriptionSummaryDto> RefreshFromProviderAsync(Guid shopId, CancellationToken cancellationToken = default)
    {
        var subscription = await _shopSubscriptionRepository.Query()
            .Where(x => x.ShopId == shopId)
            .OrderByDescending(x => x.CreatedOn)
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new AppException("subscription_not_found", "No subscription exists for this shop.", 404);

        if (string.IsNullOrWhiteSpace(subscription.StripeSubscriptionId))
        {
            _logger.LogInformation(
                "RefreshFromProvider: shop {ShopId} has no Stripe subscription id yet — nothing to reconcile.",
                shopId);
            return await BuildSummaryAsync(subscription, cancellationToken);
        }

        var snapshot = await _billingCheckoutService.GetSubscriptionAsync(subscription.StripeSubscriptionId, cancellationToken);
        if (snapshot is null)
        {
            _logger.LogWarning(
                "RefreshFromProvider: Stripe returned no subscription for shop {ShopId} ({StripeSubId}).",
                shopId, subscription.StripeSubscriptionId);
            return await BuildSummaryAsync(subscription, cancellationToken);
        }

        await ApplySnapshotAsync(subscription, "stripe_refresh", snapshot, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return await BuildSummaryAsync(subscription, cancellationToken);
    }

    public async Task ApplyStripeSubscriptionEventAsync(string eventType, StripeSubscriptionSnapshot snapshot, CancellationToken cancellationToken = default)
    {
        if (snapshot is null || string.IsNullOrWhiteSpace(snapshot.Id))
        {
            _logger.LogWarning("Stripe webhook: skipped event {EventType} with empty snapshot.", eventType);
            return;
        }

        // Resolve the ShopSubscription. Prefer the metadata.shop_id (set when we created the
        // Checkout Session); fall back to looking up by StripeSubscriptionId (in case the row
        // was created in a previous run before metadata was added).
        ShopSubscription? subscription = null;
        if (snapshot.ShopId.HasValue)
        {
            subscription = await _shopSubscriptionRepository.Query()
                .Where(x => x.ShopId == snapshot.ShopId.Value)
                .OrderByDescending(x => x.CreatedOn)
                .FirstOrDefaultAsync(cancellationToken);
        }
        if (subscription is null)
        {
            subscription = await _shopSubscriptionRepository.Query()
                .Where(x => x.StripeSubscriptionId == snapshot.Id)
                .FirstOrDefaultAsync(cancellationToken);
        }
        if (subscription is null)
        {
            _logger.LogWarning(
                "Stripe webhook: no ShopSubscription matched {EventType} for Stripe sub {SubId} (shopId={ShopId}).",
                eventType, snapshot.Id, snapshot.ShopId);
            return;
        }

        await ApplySnapshotAsync(subscription, eventType, snapshot, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        _logger.LogInformation(
            "Stripe webhook applied: shop={ShopId} eventType={EventType} status={Status} planId={PlanId}.",
            subscription.ShopId, eventType, subscription.Status, subscription.SubscriptionPlanId);
    }

    public async Task<string> CreatePortalSessionAsync(Guid shopId, CancellationToken cancellationToken = default)
    {
        var shop = await _shopRepository.GetByIdAsync(shopId, cancellationToken)
            ?? throw new AppException("shop_not_found", "Shop not found.", 404);

        if (shop.CompanyId is null)
        {
            throw new AppException("validation_failed", "Shop is not associated with a company.", 400);
        }

        var company = await _companyRepository.GetByIdAsync(shop.CompanyId.Value, cancellationToken)
            ?? throw new AppException("company_not_found", "Company not found.", 404);

        if (string.IsNullOrWhiteSpace(company.StripeCustomerId))
        {
            throw new AppException(
                "stripe_customer_missing",
                "This company has no Stripe customer yet. Complete at least one shop's checkout before opening the billing portal.",
                400);
        }

        return await _billingCheckoutService.CreatePortalSessionAsync(company.StripeCustomerId, cancellationToken);
    }

    public async Task ProcessPauseCapAsync(CancellationToken cancellationToken = default)
    {
        var now = DateTimeOffset.UtcNow;
        var warnAfter = now.AddDays(-(PauseMaxDays - 30)); // PausedOn < now - 335
        var cancelAfter = now.AddDays(-PauseMaxDays);     // PausedOn < now - 365

        var pausedSubscriptions = await _shopSubscriptionRepository.Query()
            .Where(x => x.Status == SubscriptionStatus.Suspended && x.PausedOn.HasValue)
            .ToListAsync(cancellationToken);

        foreach (var sub in pausedSubscriptions)
        {
            if (!sub.PausedOn.HasValue) continue;
            var pausedOn = sub.PausedOn.Value;

            if (pausedOn < cancelAfter)
            {
                // Hit the 1-year cap. Tell Stripe to cancel, then flip the local row. Wrap each
                // shop in its own try/catch so a single Stripe failure doesn't stall the sweep
                // for the rest.
                try
                {
                    if (!string.IsNullOrWhiteSpace(sub.StripeSubscriptionId))
                    {
                        await _billingCheckoutService.CancelSubscriptionAsync(sub.StripeSubscriptionId, cancelAtPeriodEnd: false, cancellationToken);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex,
                        "PauseCap: Stripe cancel failed for shop {ShopId} ({StripeSubId}). Proceeding with local cancel.",
                        sub.ShopId, sub.StripeSubscriptionId);
                }

                sub.Status = SubscriptionStatus.Cancelled;
                sub.CancelledOn = now;
                sub.ModifiedOn = now;

                await _billingEventRepository.AddAsync(new BillingEvent
                {
                    Id = Guid.NewGuid(),
                    CompanyId = sub.CompanyId,
                    EventType = BillingEventType.SubscriptionCancelled,
                    Description = $"Auto-cancelled after {PauseMaxDays}-day pause cap for shop {sub.ShopId}.",
                }, cancellationToken);

                continue;
            }

            if (pausedOn < warnAfter && !sub.PauseCapWarningSentOn.HasValue)
            {
                // Inside the 30-day heads-up window. Send the warning email once.
                try
                {
                    await SendPauseCapWarningEmailAsync(sub, cancellationToken);
                    sub.PauseCapWarningSentOn = now;
                    sub.ModifiedOn = now;
                }
                catch (Exception ex)
                {
                    // If the email send fails we don't set the flag, so the next sweep tries
                    // again. Log so we notice if a particular tenant keeps failing.
                    _logger.LogError(ex,
                        "PauseCap: heads-up email failed for shop {ShopId}. Will retry on next sweep.",
                        sub.ShopId);
                }
            }
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);
    }

    /// <summary>
    /// Heads-up email at 11 months: tells the company owner the paused shop will auto-cancel
    /// in ~30 days unless resumed. The in-app banner driven by <c>PauseDaysRemaining</c> is the
    /// other half of the notification pair.
    /// </summary>
    private async Task SendPauseCapWarningEmailAsync(ShopSubscription sub, CancellationToken cancellationToken)
    {
        var shop = await _shopRepository.GetByIdAsync(sub.ShopId, cancellationToken);
        var company = await _companyRepository.GetByIdAsync(sub.CompanyId, cancellationToken);
        if (company is null || string.IsNullOrWhiteSpace(company.Email))
        {
            _logger.LogWarning("PauseCap: no email on file for company {CompanyId}; skipping warning.", sub.CompanyId);
            return;
        }

        var shopLabel = shop?.ShopName ?? sub.ShopId.ToString();
        var subject = $"Action needed: paused shop \"{shopLabel}\" auto-cancels in ~30 days";
        var body =
            $"Hi,\n\n" +
            $"Shop \"{shopLabel}\" has been paused since {sub.PausedOn:yyyy-MM-dd}. Our policy auto-cancels paused " +
            $"subscriptions after {PauseMaxDays} days so we don't keep them in billing limbo indefinitely.\n\n" +
            $"If you intend to keep using this shop, resume it from the Ops Arrow app. Resuming reactivates the " +
            $"saved card and continues your existing plan with no interruption.\n\n" +
            $"If you don't resume before the cap, the subscription will be cancelled. The shop's historical data " +
            $"stays available read-only in the app — but to start using it again you'd need to subscribe fresh.\n\n" +
            $"Thanks,\nOps Arrow";

        await _emailSender.SendAsync(company.Email, subject, body, cancellationToken);
    }

    public async Task ProcessTrialExpiriesAsync(CancellationToken cancellationToken = default)
    {
        var now = DateTimeOffset.UtcNow;
        var expired = await _shopSubscriptionRepository.Query()
            .Where(x => x.Status == SubscriptionStatus.TrialActive
                        && x.TrialEndsOn.HasValue
                        && x.TrialEndsOn.Value < now)
            .ToListAsync(cancellationToken);

        if (expired.Count == 0) return;

        foreach (var item in expired)
        {
            item.Status = SubscriptionStatus.TrialExpired;
            item.ModifiedOn = now;

            await _billingEventRepository.AddAsync(new BillingEvent
            {
                Id = Guid.NewGuid(),
                CompanyId = item.CompanyId,
                EventType = BillingEventType.TrialExpired,
                Description = $"Trial expired for shop {item.ShopId}.",
            }, cancellationToken);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);
    }

    /// <summary>
    /// Single application point for any state we got from Stripe — whether via a webhook or a
    /// refresh. Maps Stripe status + cancel_at_period_end onto our SubscriptionStatus enum,
    /// updates period/trial dates, persists identifiers and a BillingEvent for audit.
    /// </summary>
    private async Task ApplySnapshotAsync(
        ShopSubscription subscription,
        string eventType,
        StripeSubscriptionSnapshot snapshot,
        CancellationToken cancellationToken)
    {
        if (snapshot.PlanId.HasValue)
        {
            var matchedPlan = await _planRepository.GetByIdAsync(snapshot.PlanId.Value, cancellationToken);
            if (matchedPlan is not null)
            {
                subscription.SubscriptionPlanId = matchedPlan.Id;
                subscription.BillingCycle = matchedPlan.BillingCycle;
                subscription.Price = matchedPlan.PricePerShop;
            }
        }
        else if (!string.IsNullOrWhiteSpace(snapshot.PriceId))
        {
            // No metadata? Fall back to mapping Price ID → Plan.
            var byPrice = await _planRepository.Query()
                .Where(p => p.IsActive && p.StripePriceId == snapshot.PriceId)
                .FirstOrDefaultAsync(cancellationToken);
            if (byPrice is not null)
            {
                subscription.SubscriptionPlanId = byPrice.Id;
                subscription.BillingCycle = byPrice.BillingCycle;
                subscription.Price = byPrice.PricePerShop;
            }
        }

        subscription.StripeSubscriptionId = snapshot.Id;
        if (!string.IsNullOrWhiteSpace(snapshot.CustomerId))
        {
            subscription.StripeCustomerId = snapshot.CustomerId;
        }
        subscription.ProviderSubscriptionId = snapshot.Id;
        subscription.PaymentProvider = "stripe";

        if (snapshot.CurrentPeriodStart.HasValue) subscription.CurrentPeriodStartedOn = snapshot.CurrentPeriodStart;
        if (snapshot.CurrentPeriodEnd.HasValue) subscription.CurrentPeriodEndsOn = snapshot.CurrentPeriodEnd;
        subscription.CancelAtPeriodEnd = snapshot.CancelAtPeriodEnd;
        if (snapshot.CanceledAt.HasValue) subscription.CancelledOn = snapshot.CanceledAt;

        subscription.Status = MapStripeStatusToSubscriptionStatus(snapshot.Status);
        subscription.ModifiedOn = DateTimeOffset.UtcNow;

        await _billingEventRepository.AddAsync(new BillingEvent
        {
            Id = Guid.NewGuid(),
            CompanyId = subscription.CompanyId,
            EventType = MapBillingEventType(eventType),
            Description = $"Stripe {eventType} for shop {subscription.ShopId} (sub={snapshot.Id}, status={snapshot.Status}).",
            NewValue = System.Text.Json.JsonSerializer.Serialize(snapshot),
        }, cancellationToken);
    }

    /// <summary>
    /// Stripe → domain status. Stripe's `trialing` is a paid-trial concept (card on file); since
    /// we keep trials in our DB and never request `trial_period_days`, this won't normally
    /// appear, but we still map it correctly in case the dashboard is changed.
    /// </summary>
    private static SubscriptionStatus MapStripeStatusToSubscriptionStatus(string stripeStatus)
    {
        return stripeStatus switch
        {
            "trialing" => SubscriptionStatus.TrialActive,
            "active" => SubscriptionStatus.Active,
            "past_due" => SubscriptionStatus.PastDue,
            "unpaid" => SubscriptionStatus.PaymentFailed,
            "incomplete" => SubscriptionStatus.PaymentFailed,
            "incomplete_expired" => SubscriptionStatus.Expired,
            "canceled" => SubscriptionStatus.Cancelled,
            "paused" => SubscriptionStatus.Suspended,
            _ => SubscriptionStatus.Active,
        };
    }

    private static BillingEventType MapBillingEventType(string eventType) => eventType switch
    {
        "customer.subscription.created" => BillingEventType.SubscriptionActivated,
        "customer.subscription.updated" => BillingEventType.SubscriptionChanged,
        "customer.subscription.deleted" => BillingEventType.SubscriptionCancelled,
        "invoice.payment_succeeded" => BillingEventType.SubscriptionRenewed,
        "invoice.payment_failed" => BillingEventType.PaymentFailed,
        "stripe_refresh" => BillingEventType.SubscriptionChanged,
        _ => BillingEventType.SubscriptionChanged,
    };

    private const int PauseMaxDays = 365;

    private async Task<ShopSubscriptionSummaryDto> BuildSummaryAsync(ShopSubscription subscription, CancellationToken cancellationToken)
    {
        var plan = subscription.SubscriptionPlanId.HasValue
            ? await _planRepository.Query()
                .Include(p => p.PlanFeatures).ThenInclude(pf => pf.Feature)
                .FirstOrDefaultAsync(p => p.Id == subscription.SubscriptionPlanId.Value, cancellationToken)
            : null;

        var now = DateTimeOffset.UtcNow;
        int? trialDaysRemaining = null;
        if (subscription.TrialEndsOn.HasValue && subscription.Status == SubscriptionStatus.TrialActive)
        {
            var diff = (subscription.TrialEndsOn.Value - now).TotalDays;
            trialDaysRemaining = diff > 0 ? (int)Math.Ceiling(diff) : 0;
        }

        int? pauseDaysRemaining = null;
        if (subscription.Status == SubscriptionStatus.Suspended && subscription.PausedOn.HasValue)
        {
            var autoCancelAt = subscription.PausedOn.Value.AddDays(PauseMaxDays);
            var diff = (autoCancelAt - now).TotalDays;
            pauseDaysRemaining = diff > 0 ? (int)Math.Ceiling(diff) : 0;
        }

        var requiresBilling = subscription.Status == SubscriptionStatus.TrialExpired
            || subscription.Status == SubscriptionStatus.Cancelled
            || subscription.Status == SubscriptionStatus.Expired
            || subscription.Status == SubscriptionStatus.PaymentFailed;

        var features = ServiceMappingExtensions.ExtractEnabledFeatureKeys(plan?.PlanFeatures);

        return new ShopSubscriptionSummaryDto
        {
            ShopId = subscription.ShopId,
            CompanyId = subscription.CompanyId,
            ShopSubscriptionId = subscription.Id,
            SubscriptionPlanId = subscription.SubscriptionPlanId,
            PlanName = plan?.Name ?? (subscription.Status == SubscriptionStatus.TrialActive ? "Free Trial" : string.Empty),
            BillingCycle = subscription.BillingCycle,
            Status = subscription.Status,
            Price = subscription.Price,
            TrialStartedOn = subscription.TrialStartedOn,
            TrialEndsOn = subscription.TrialEndsOn,
            CurrentPeriodStartedOn = subscription.CurrentPeriodStartedOn,
            CurrentPeriodEndsOn = subscription.CurrentPeriodEndsOn,
            TrialDaysRemaining = trialDaysRemaining,
            RequiresBillingAction = requiresBilling,
            IncludedFeatures = features,
            MaxUsers = plan?.MaxUsers,
            ReportExportsPerMonth = plan?.ReportExportsPerMonth,
            PausedOn = subscription.PausedOn,
            PauseDaysRemaining = pauseDaysRemaining,
        };
    }

    private async Task<SubscriptionPlan?> ResolveTrialPlanAsync(CancellationToken cancellationToken)
    {
        return await _planRepository.Query()
            .Where(p => p.IsActive && p.BillingCycle == BillingCycle.Trial)
            .OrderByDescending(p => p.TrialDays)
            .FirstOrDefaultAsync(cancellationToken);
    }

    /// <summary>
    /// Trial-days resolution. Configurable in three places, in priority order:
    /// <list type="number">
    ///   <item>The plan the owner picked at shop creation (per-plan, admin-editable).</item>
    ///   <item>The legacy "Trial" billing-cycle plan (admin-editable).</item>
    ///   <item><see cref="CfgSubscriptionSettings.DefaultTrialDays"/> for the global record (ShopId = null) — change this from the admin tool to adjust the system-wide default.</item>
    ///   <item><see cref="HardcodedTrialDaysFallback"/> — last-resort if nothing above is configured.</item>
    /// </list>
    /// </summary>
    private async Task<int> ResolveTrialDaysAsync(SubscriptionPlan? intendedPlan, SubscriptionPlan? trialPlan, CancellationToken cancellationToken)
    {
        if (intendedPlan?.TrialDays > 0) return intendedPlan.TrialDays;
        if (trialPlan?.TrialDays > 0) return trialPlan.TrialDays;

        var globalSettings = await _subscriptionSettingsRepository.Query()
            .Where(x => x.ShopId == null)
            .OrderByDescending(x => x.CreatedOn)
            .FirstOrDefaultAsync(cancellationToken);
        if (globalSettings?.DefaultTrialDays is int globalDefault && globalDefault > 0)
        {
            return globalDefault;
        }

        return HardcodedTrialDaysFallback;
    }
}
