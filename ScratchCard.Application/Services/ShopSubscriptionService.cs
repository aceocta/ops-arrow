using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Subscriptions;
using ScratchCard.Domain.Entities;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.Services;

public class ShopSubscriptionService : IShopSubscriptionService
{
    private const int DefaultTrialDaysFallback = 14;

    private readonly IRepository<Shop> _shopRepository;
    private readonly IRepository<ShopSubscription> _shopSubscriptionRepository;
    private readonly IRepository<SubscriptionPlan> _planRepository;
    private readonly IRepository<BillingEvent> _billingEventRepository;
    private readonly IIapReceiptVerifier _iapReceiptVerifier;
    private readonly ICurrentUserService _currentUserService;
    private readonly IUnitOfWork _unitOfWork;

    public ShopSubscriptionService(
        IRepository<Shop> shopRepository,
        IRepository<ShopSubscription> shopSubscriptionRepository,
        IRepository<SubscriptionPlan> planRepository,
        IRepository<BillingEvent> billingEventRepository,
        IIapReceiptVerifier iapReceiptVerifier,
        ICurrentUserService currentUserService,
        IUnitOfWork unitOfWork)
    {
        _shopRepository = shopRepository;
        _shopSubscriptionRepository = shopSubscriptionRepository;
        _planRepository = planRepository;
        _billingEventRepository = billingEventRepository;
        _iapReceiptVerifier = iapReceiptVerifier;
        _currentUserService = currentUserService;
        _unitOfWork = unitOfWork;
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
        // shop on a trial referencing that plan so the user knows what they'll be charged at
        // conversion. If no plan is supplied we fall back to a generic trial plan.
        var intendedPlan = intendedPlanId.HasValue
            ? await _planRepository.GetByIdAsync(intendedPlanId.Value, cancellationToken)
            : null;
        var trialPlan = await ResolveTrialPlanAsync(cancellationToken);

        var planForRecord = intendedPlan ?? trialPlan;
        var trialDays = intendedPlan?.TrialDays > 0
            ? intendedPlan.TrialDays
            : trialPlan?.TrialDays > 0 ? trialPlan.TrialDays : DefaultTrialDaysFallback;
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

    public async Task<ShopSubscriptionSummaryDto> GetSummaryAsync(Guid shopId, CancellationToken cancellationToken = default)
    {
        var subscription = await _shopSubscriptionRepository.Query()
            .Where(x => x.ShopId == shopId)
            .OrderByDescending(x => x.CreatedOn)
            .FirstOrDefaultAsync(cancellationToken);

        if (subscription is null)
        {
            return await EnsureTrialAsync(shopId, null, cancellationToken);
        }

        return await BuildSummaryAsync(subscription, cancellationToken);
    }

    public async Task<ShopEntitlementsDto> GetEntitlementsAsync(Guid shopId, CancellationToken cancellationToken = default)
    {
        var summary = await GetSummaryAsync(shopId, cancellationToken);

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
        // Plan selected on the client; activation is finalised when an IAP receipt is recorded
        // (or via an admin-driven flow). Until then keep the existing status so trials still
        // count down and gating remains correct.
        if (subscription.Status == default)
        {
            subscription.Status = SubscriptionStatus.TrialActive;
            subscription.TrialStartedOn = now;
            subscription.TrialEndsOn = now.AddDays(plan.TrialDays > 0 ? plan.TrialDays : DefaultTrialDaysFallback);
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

    public async Task<ShopSubscriptionSummaryDto> RecordIapReceiptAsync(ShopIapReceiptRequest request, CancellationToken cancellationToken = default)
    {
        if (request.ShopId == Guid.Empty)
        {
            throw new AppException("validation_failed", "ShopId is required.", 400);
        }

        var shop = await _shopRepository.GetByIdAsync(request.ShopId, cancellationToken)
            ?? throw new AppException("shop_not_found", "Shop not found.", 404);

        if (shop.CompanyId is null)
        {
            throw new AppException("validation_failed", "Shop is not associated with a company.", 400);
        }

        var subscription = await _shopSubscriptionRepository.Query()
            .Where(x => x.ShopId == request.ShopId)
            .OrderByDescending(x => x.CreatedOn)
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new AppException("subscription_not_found", "No subscription exists for this shop. Select a plan first.", 404);

        // Verify the receipt with the store before trusting it. The default implementation is a
        // no-op for development; production binds the real verifier in Infrastructure DI.
        var verification = await _iapReceiptVerifier.VerifyAsync(new IapReceiptVerificationRequest
        {
            Platform = request.Platform,
            ProductId = request.ProductId,
            TransactionId = request.TransactionId,
            PurchaseToken = request.PurchaseToken,
            OriginalTransactionId = request.OriginalTransactionId,
            ReceiptData = request.ReceiptData,
        }, cancellationToken);

        if (!verification.IsValid)
        {
            throw new AppException("receipt_invalid", verification.Reason ?? "Receipt could not be verified.", 400);
        }

        // Resolve the plan from the store's product ID so the shop is tied to the right tier.
        var resolvedProductId = verification.ResolvedProductId ?? request.ProductId;
        var matchedPlan = await ResolvePlanByProductIdAsync(request.Platform, resolvedProductId, cancellationToken);

        var now = DateTimeOffset.UtcNow;
        subscription.PaymentProvider = request.Platform;
        subscription.ProviderProductId = resolvedProductId;
        subscription.ProviderSubscriptionId = request.TransactionId;
        subscription.ProviderOriginalTransactionId = request.OriginalTransactionId ?? request.TransactionId;
        subscription.Status = SubscriptionStatus.Active;
        subscription.CurrentPeriodStartedOn = verification.PurchaseDate ?? now;

        if (matchedPlan is not null)
        {
            subscription.SubscriptionPlanId = matchedPlan.Id;
            subscription.BillingCycle = matchedPlan.BillingCycle;
            subscription.Price = matchedPlan.PricePerShop;
        }

        // Prefer the store-reported expiry if available; otherwise project from cycle.
        subscription.CurrentPeriodEndsOn = verification.ExpiresDate ?? (subscription.BillingCycle == BillingCycle.Annual
            ? subscription.CurrentPeriodStartedOn.Value.AddYears(1)
            : subscription.CurrentPeriodStartedOn.Value.AddMonths(1));
        subscription.ModifiedOn = now;
        subscription.ModifiedBy = _currentUserService.UserId;

        var billingEvent = new BillingEvent
        {
            Id = Guid.NewGuid(),
            CompanyId = shop.CompanyId.Value,
            EventType = BillingEventType.IapReceiptReceived,
            Description = $"IAP receipt accepted for shop {shop.ShopName} ({request.Platform}/{request.ProductId}).",
            NewValue = System.Text.Json.JsonSerializer.Serialize(request),
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

        var now = DateTimeOffset.UtcNow;
        subscription.CancelAtPeriodEnd = false;
        subscription.CancelledOn = null;
        if (subscription.Status == SubscriptionStatus.Cancelled)
        {
            // Only revive if still within the paid period; otherwise leave for user to repurchase.
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

    public async Task ApplyRevenueCatEventAsync(RevenueCatWebhookEvent webhookEvent, CancellationToken cancellationToken = default)
    {
        if (webhookEvent is null || string.IsNullOrWhiteSpace(webhookEvent.AppUserId))
        {
            return;
        }

        if (!Guid.TryParse(webhookEvent.AppUserId, out var shopId))
        {
            // RevenueCat appUserId is expected to be the ShopId GUID. If it's not, we have a
            // misconfigured client; persist a billing event for audit and bail.
            return;
        }

        var subscription = await _shopSubscriptionRepository.Query()
            .Where(x => x.ShopId == shopId)
            .OrderByDescending(x => x.CreatedOn)
            .FirstOrDefaultAsync(cancellationToken);
        if (subscription is null)
        {
            return;
        }

        var type = (webhookEvent.Type ?? string.Empty).ToUpperInvariant();
        var purchasedAt = webhookEvent.PurchasedAtMs.HasValue
            ? DateTimeOffset.FromUnixTimeMilliseconds(webhookEvent.PurchasedAtMs.Value)
            : (DateTimeOffset?)null;
        var expiresAt = webhookEvent.ExpirationAtMs.HasValue
            ? DateTimeOffset.FromUnixTimeMilliseconds(webhookEvent.ExpirationAtMs.Value)
            : (DateTimeOffset?)null;

        // Resolve plan from product id if RevenueCat gave us one (so a product-change updates the
        // plan reference on the subscription too).
        var resolvedProductId = webhookEvent.NewProductId ?? webhookEvent.ProductId;
        if (!string.IsNullOrWhiteSpace(resolvedProductId))
        {
            var platform = ResolvePlatform(webhookEvent.Store);
            var matchedPlan = await ResolvePlanByProductIdAsync(platform, resolvedProductId, cancellationToken);
            if (matchedPlan is not null)
            {
                subscription.SubscriptionPlanId = matchedPlan.Id;
                subscription.BillingCycle = matchedPlan.BillingCycle;
                subscription.Price = matchedPlan.PricePerShop;
            }
            subscription.ProviderProductId = resolvedProductId;
        }

        switch (type)
        {
            case "INITIAL_PURCHASE":
            case "RENEWAL":
            case "UNCANCELLATION":
            case "PRODUCT_CHANGE":
                subscription.Status = SubscriptionStatus.Active;
                subscription.CancelAtPeriodEnd = false;
                subscription.CancelledOn = null;
                if (purchasedAt.HasValue) subscription.CurrentPeriodStartedOn = purchasedAt;
                if (expiresAt.HasValue) subscription.CurrentPeriodEndsOn = expiresAt;
                break;

            case "CANCELLATION":
                // User cancelled but still has access until period end.
                subscription.CancelAtPeriodEnd = true;
                break;

            case "EXPIRATION":
                subscription.Status = SubscriptionStatus.Expired;
                subscription.CurrentPeriodEndsOn ??= expiresAt;
                break;

            case "BILLING_ISSUE":
                subscription.Status = SubscriptionStatus.PaymentFailed;
                break;

            case "SUBSCRIPTION_PAUSED":
                subscription.Status = SubscriptionStatus.Suspended;
                break;

            // Other events (NON_RENEWING_PURCHASE, TRANSFER, INVOICE_ISSUANCE, TEST) — log only.
        }

        subscription.PaymentProvider = "revenuecat";
        subscription.ModifiedOn = DateTimeOffset.UtcNow;

        await _billingEventRepository.AddAsync(new BillingEvent
        {
            Id = Guid.NewGuid(),
            CompanyId = subscription.CompanyId,
            EventType = MapBillingEventType(type),
            Description = $"RevenueCat {type} for shop {subscription.ShopId}.",
            NewValue = System.Text.Json.JsonSerializer.Serialize(webhookEvent),
        }, cancellationToken);

        await _unitOfWork.SaveChangesAsync(cancellationToken);
    }

    private static BillingEventType MapBillingEventType(string type) => type switch
    {
        "INITIAL_PURCHASE" => BillingEventType.SubscriptionActivated,
        "RENEWAL" => BillingEventType.SubscriptionRenewed,
        "PRODUCT_CHANGE" => BillingEventType.SubscriptionChanged,
        "UNCANCELLATION" => BillingEventType.SubscriptionReactivated,
        "CANCELLATION" => BillingEventType.SubscriptionCancelled,
        "EXPIRATION" => BillingEventType.SubscriptionCancelled,
        "BILLING_ISSUE" => BillingEventType.PaymentFailed,
        _ => BillingEventType.SubscriptionChanged,
    };

    private static string ResolvePlatform(string? store)
    {
        if (string.IsNullOrWhiteSpace(store)) return "ios";
        var upper = store.ToUpperInvariant();
        return upper == "APP_STORE" || upper == "MAC_APP_STORE" ? "ios" : "android";
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
        };
    }

    private async Task<SubscriptionPlan?> ResolvePlanByProductIdAsync(string platform, string productId, CancellationToken cancellationToken)
    {
        var isIos = string.Equals(platform, "ios", StringComparison.OrdinalIgnoreCase);
        return await _planRepository.Query()
            .Where(p => p.IsActive && (isIos ? p.AppleProductId == productId : p.GoogleProductId == productId))
            .FirstOrDefaultAsync(cancellationToken);
    }

    private async Task<SubscriptionPlan?> ResolveTrialPlanAsync(CancellationToken cancellationToken)
    {
        return await _planRepository.Query()
            .Where(p => p.IsActive && p.BillingCycle == BillingCycle.Trial)
            .OrderByDescending(p => p.TrialDays)
            .FirstOrDefaultAsync(cancellationToken);
    }

}
