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
    private readonly ICurrentUserService _currentUserService;
    private readonly IUnitOfWork _unitOfWork;

    public ShopSubscriptionService(
        IRepository<Shop> shopRepository,
        IRepository<ShopSubscription> shopSubscriptionRepository,
        IRepository<SubscriptionPlan> planRepository,
        IRepository<BillingEvent> billingEventRepository,
        ICurrentUserService currentUserService,
        IUnitOfWork unitOfWork)
    {
        _shopRepository = shopRepository;
        _shopSubscriptionRepository = shopSubscriptionRepository;
        _planRepository = planRepository;
        _billingEventRepository = billingEventRepository;
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

        var now = DateTimeOffset.UtcNow;

        // STUB: production must verify the receipt against the store (App Store Server / Google
        // Play Developer API) or trust a signed RevenueCat webhook. We trust the client here so
        // mobile development can continue and record an audit trail.
        subscription.PaymentProvider = request.Platform;
        subscription.ProviderProductId = request.ProductId;
        subscription.ProviderSubscriptionId = request.TransactionId;
        subscription.ProviderOriginalTransactionId = request.OriginalTransactionId ?? request.TransactionId;
        subscription.Status = SubscriptionStatus.Active;
        subscription.CurrentPeriodStartedOn = now;
        subscription.CurrentPeriodEndsOn = subscription.BillingCycle == BillingCycle.Annual
            ? now.AddYears(1)
            : now.AddMonths(1);
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

    private async Task<ShopSubscriptionSummaryDto> BuildSummaryAsync(ShopSubscription subscription, CancellationToken cancellationToken)
    {
        var plan = subscription.SubscriptionPlanId.HasValue
            ? await _planRepository.GetByIdAsync(subscription.SubscriptionPlanId.Value, cancellationToken)
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

        var features = SplitFeatures(plan?.IncludedFeatures);

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

    private async Task<SubscriptionPlan?> ResolveTrialPlanAsync(CancellationToken cancellationToken)
    {
        return await _planRepository.Query()
            .Where(p => p.IsActive && p.BillingCycle == BillingCycle.Trial)
            .OrderByDescending(p => p.TrialDays)
            .FirstOrDefaultAsync(cancellationToken);
    }

    private static IReadOnlyCollection<string> SplitFeatures(string? rawFeatures)
    {
        if (string.IsNullOrWhiteSpace(rawFeatures))
        {
            return Array.Empty<string>();
        }

        return rawFeatures
            .Split(new[] { ',', ';', '\n' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .ToArray();
    }
}
