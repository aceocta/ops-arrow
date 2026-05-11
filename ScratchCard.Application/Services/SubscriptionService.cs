using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Subscriptions;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Entities;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.Services;

public class SubscriptionService : ISubscriptionService
{
    private readonly IRepository<Company> _companyRepository;
    private readonly IRepository<Shop> _shopRepository;
    private readonly IRepository<ShopUser> _shopUserRepository;
    private readonly IRepository<SubscriptionPlan> _planRepository;
    private readonly IRepository<CompanySubscription> _companySubscriptionRepository;
    private readonly IRepository<SubscriptionDiscountRule> _discountRuleRepository;
    private readonly IRepository<SubscriptionInvoice> _invoiceRepository;
    private readonly IRepository<BillingEvent> _billingEventRepository;
    private readonly ISubscriptionCalculationService _calculationService;
    private readonly ISubscriptionBillingService _subscriptionBillingService;
    private readonly IInvoiceService _invoiceService;
    private readonly ICurrentUserService _currentUserService;
    private readonly IUnitOfWork _unitOfWork;

    public SubscriptionService(
        IRepository<Company> companyRepository,
        IRepository<Shop> shopRepository,
        IRepository<ShopUser> shopUserRepository,
        IRepository<SubscriptionPlan> planRepository,
        IRepository<CompanySubscription> companySubscriptionRepository,
        IRepository<SubscriptionDiscountRule> discountRuleRepository,
        IRepository<SubscriptionInvoice> invoiceRepository,
        IRepository<BillingEvent> billingEventRepository,
        ISubscriptionCalculationService calculationService,
        ISubscriptionBillingService subscriptionBillingService,
        IInvoiceService invoiceService,
        ICurrentUserService currentUserService,
        IUnitOfWork unitOfWork)
    {
        _companyRepository = companyRepository;
        _shopRepository = shopRepository;
        _shopUserRepository = shopUserRepository;
        _planRepository = planRepository;
        _companySubscriptionRepository = companySubscriptionRepository;
        _discountRuleRepository = discountRuleRepository;
        _invoiceRepository = invoiceRepository;
        _billingEventRepository = billingEventRepository;
        _calculationService = calculationService;
        _subscriptionBillingService = subscriptionBillingService;
        _invoiceService = invoiceService;
        _currentUserService = currentUserService;
        _unitOfWork = unitOfWork;
    }

    public async Task<IReadOnlyCollection<SubscriptionPlanDto>> GetPlansAsync(CancellationToken cancellationToken = default)
    {
        var plans = await _planRepository.Query()
            .AsNoTracking()
            .Where(x => x.IsActive)
            .OrderBy(x => x.BillingCycle)
            .ThenBy(x => x.Name)
            .ToListAsync(cancellationToken);

        return plans.Select(x => x.ToDto()).ToArray();
    }

    public async Task<SubscriptionSummaryDto> GetSummaryAsync(Guid companyId, CancellationToken cancellationToken = default)
    {
        await EnsureCompanyAccessAsync(companyId, cancellationToken);
        await ProcessTrialExpiryForCompanyAsync(companyId, cancellationToken);

        var subscription = await GetCurrentSubscriptionAsync(companyId, cancellationToken);
        return await BuildSummaryAsync(subscription, cancellationToken);
    }

    public async Task<SubscriptionCalculationResultDto> CalculateAsync(SubscriptionCalculationRequest request, CancellationToken cancellationToken = default)
    {
        await EnsureCompanyAccessAsync(request.CompanyId, cancellationToken);
        return await _calculationService.CalculateAsync(request.CompanyId, request.PlanId, cancellationToken);
    }

    public async Task<SubscriptionSummaryDto> SelectPlanAsync(SelectSubscriptionPlanRequest request, CancellationToken cancellationToken = default)
    {
        await EnsureCompanyAccessAsync(request.CompanyId, cancellationToken);

        var plan = await _planRepository.Query()
            .FirstOrDefaultAsync(x => x.Id == request.PlanId && x.IsActive, cancellationToken)
            ?? throw new AppException("subscription_plan_not_found", "Subscription plan not found or inactive.", 404);

        if (plan.BillingCycle == BillingCycle.Trial)
        {
            throw new AppException("validation_failed", "Trial plan cannot be selected manually.", 400);
        }

        var calculation = await _calculationService.CalculateAsync(request.CompanyId, request.PlanId, cancellationToken);
        if (calculation.ActiveShopCount < 1)
        {
            throw new AppException("validation_failed", "At least one active shop is required for paid plans.", 400);
        }

        var now = DateTimeOffset.UtcNow;
        var subscription = await _companySubscriptionRepository.Query()
            .FirstOrDefaultAsync(x => x.CompanyId == request.CompanyId, cancellationToken);

        if (subscription is null)
        {
            subscription = new CompanySubscription
            {
                CompanyId = request.CompanyId,
                SubscriptionPlanId = plan.Id,
                CreatedOn = now,
                CreatedBy = _currentUserService.UserId
            };
            await _companySubscriptionRepository.AddAsync(subscription, cancellationToken);
        }

        var previousStatus = subscription.Status;
        subscription.SubscriptionPlanId = plan.Id;
        subscription.Status = SubscriptionStatus.Active;
        subscription.BillingCycle = plan.BillingCycle;
        subscription.PricePerShop = calculation.PricePerShop;
        subscription.ActiveShopCount = calculation.ActiveShopCount;
        subscription.DiscountAmount = calculation.DiscountAmount;
        subscription.DiscountPercentage = calculation.DiscountPercentage;
        subscription.SubTotalAmount = calculation.SubTotalAmount;
        subscription.TotalAmount = calculation.TotalAmount;
        subscription.CurrentPeriodStartedOn = now;
        subscription.CurrentPeriodEndsOn = plan.BillingCycle == BillingCycle.Annual ? now.AddYears(1) : now.AddMonths(1);
        subscription.CancelledOn = null;
        subscription.CancelAtPeriodEnd = false;
        subscription.ModifiedOn = now;
        subscription.ModifiedBy = _currentUserService.UserId;

        _companySubscriptionRepository.Update(subscription);

        await _billingEventRepository.AddAsync(new BillingEvent
        {
            CompanyId = request.CompanyId,
            CompanySubscription = subscription,
            EventType = previousStatus == SubscriptionStatus.Active
                ? BillingEventType.SubscriptionChanged
                : BillingEventType.SubscriptionActivated,
            Description = $"Plan selected: {plan.Name}",
            OldValue = previousStatus.ToString(),
            NewValue = $"{plan.BillingCycle}|{calculation.TotalAmount}",
            CreatedOn = now,
            CreatedBy = _currentUserService.UserId
        }, cancellationToken);

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        await _subscriptionBillingService.CreateInvoiceAsync(subscription.Id, cancellationToken);

        var persisted = await GetCurrentSubscriptionAsync(request.CompanyId, cancellationToken);
        return await BuildSummaryAsync(persisted, cancellationToken);
    }

    public async Task<SubscriptionSummaryDto> CancelAsync(Guid companyId, bool cancelAtPeriodEnd, CancellationToken cancellationToken = default)
    {
        await EnsureCompanyAccessAsync(companyId, cancellationToken);
        var subscription = await GetCurrentSubscriptionAsync(companyId, cancellationToken);

        var now = DateTimeOffset.UtcNow;
        subscription.CancelAtPeriodEnd = cancelAtPeriodEnd;
        subscription.CancelledOn = now;
        subscription.Status = cancelAtPeriodEnd ? SubscriptionStatus.Cancelled : SubscriptionStatus.Expired;
        if (!cancelAtPeriodEnd)
        {
            subscription.CurrentPeriodEndsOn = now;
        }

        subscription.ModifiedOn = now;
        subscription.ModifiedBy = _currentUserService.UserId;
        _companySubscriptionRepository.Update(subscription);

        await _billingEventRepository.AddAsync(new BillingEvent
        {
            CompanyId = companyId,
            CompanySubscriptionId = subscription.Id,
            EventType = BillingEventType.SubscriptionCancelled,
            Description = cancelAtPeriodEnd ? "Subscription set to cancel at period end." : "Subscription cancelled immediately.",
            OldValue = SubscriptionStatus.Active.ToString(),
            NewValue = subscription.Status.ToString(),
            CreatedOn = now,
            CreatedBy = _currentUserService.UserId
        }, cancellationToken);

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return await BuildSummaryAsync(subscription, cancellationToken);
    }

    public async Task<SubscriptionSummaryDto> ReactivateAsync(Guid companyId, CancellationToken cancellationToken = default)
    {
        await EnsureCompanyAccessAsync(companyId, cancellationToken);
        var subscription = await GetCurrentSubscriptionAsync(companyId, cancellationToken);

        if (subscription.BillingCycle == BillingCycle.Trial)
        {
            throw new AppException("validation_failed", "Trial subscription cannot be reactivated after expiry.", 400);
        }

        var calculation = await _calculationService.CalculateAsync(companyId, subscription.SubscriptionPlanId, cancellationToken);
        var now = DateTimeOffset.UtcNow;

        subscription.Status = SubscriptionStatus.Active;
        subscription.ActiveShopCount = calculation.ActiveShopCount;
        subscription.PricePerShop = calculation.PricePerShop;
        subscription.SubTotalAmount = calculation.SubTotalAmount;
        subscription.DiscountAmount = calculation.DiscountAmount;
        subscription.DiscountPercentage = calculation.DiscountPercentage;
        subscription.TotalAmount = calculation.TotalAmount;
        subscription.CurrentPeriodStartedOn = now;
        subscription.CurrentPeriodEndsOn = subscription.BillingCycle == BillingCycle.Annual ? now.AddYears(1) : now.AddMonths(1);
        subscription.CancelledOn = null;
        subscription.CancelAtPeriodEnd = false;
        subscription.ModifiedOn = now;
        subscription.ModifiedBy = _currentUserService.UserId;

        _companySubscriptionRepository.Update(subscription);

        await _billingEventRepository.AddAsync(new BillingEvent
        {
            CompanyId = companyId,
            CompanySubscriptionId = subscription.Id,
            EventType = BillingEventType.SubscriptionReactivated,
            Description = "Subscription reactivated.",
            NewValue = subscription.Status.ToString(),
            CreatedOn = now,
            CreatedBy = _currentUserService.UserId
        }, cancellationToken);

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        await _subscriptionBillingService.CreateInvoiceAsync(subscription.Id, cancellationToken);

        return await BuildSummaryAsync(subscription, cancellationToken);
    }

    public Task<IReadOnlyCollection<SubscriptionInvoiceDto>> ListInvoicesAsync(Guid companyId, CancellationToken cancellationToken = default)
        => _invoiceService.ListAsync(companyId, cancellationToken);

    public Task<SubscriptionInvoiceDto> GetInvoiceAsync(Guid invoiceId, CancellationToken cancellationToken = default)
        => _invoiceService.GetAsync(invoiceId, cancellationToken);

    public async Task<IReadOnlyCollection<SubscriptionDiscountRuleDto>> ListDiscountRulesAsync(CancellationToken cancellationToken = default)
    {
        EnsurePlatformAdmin();

        var rules = await _discountRuleRepository.Query()
            .AsNoTracking()
            .OrderBy(x => x.SubscriptionPlanId)
            .ThenBy(x => x.MinShopCount)
            .ToListAsync(cancellationToken);

        return rules.Select(x => x.ToDto()).ToArray();
    }

    public async Task<SubscriptionDiscountRuleDto> CreateDiscountRuleAsync(UpsertSubscriptionDiscountRuleRequest request, CancellationToken cancellationToken = default)
    {
        EnsurePlatformAdmin();
        ValidateDiscountRule(request);

        if (request.SubscriptionPlanId.HasValue)
        {
            var planExists = await _planRepository.Query()
                .AsNoTracking()
                .AnyAsync(x => x.Id == request.SubscriptionPlanId.Value, cancellationToken);
            if (!planExists)
            {
                throw new AppException("subscription_plan_not_found", "Subscription plan not found.", 404);
            }
        }

        var now = DateTimeOffset.UtcNow;
        var entity = new SubscriptionDiscountRule
        {
            SubscriptionPlanId = request.SubscriptionPlanId,
            MinShopCount = request.MinShopCount,
            MaxShopCount = request.MaxShopCount,
            DiscountType = request.DiscountType,
            DiscountValue = request.DiscountValue,
            IsActive = request.IsActive,
            Description = request.Description,
            CreatedOn = now,
            CreatedBy = _currentUserService.UserId
        };

        await _discountRuleRepository.AddAsync(entity, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return entity.ToDto();
    }

    public async Task<SubscriptionDiscountRuleDto> UpdateDiscountRuleAsync(Guid id, UpsertSubscriptionDiscountRuleRequest request, CancellationToken cancellationToken = default)
    {
        EnsurePlatformAdmin();
        ValidateDiscountRule(request);

        var entity = await _discountRuleRepository.GetByIdAsync(id, cancellationToken)
            ?? throw new AppException("discount_rule_not_found", "Discount rule not found.", 404);

        entity.SubscriptionPlanId = request.SubscriptionPlanId;
        entity.MinShopCount = request.MinShopCount;
        entity.MaxShopCount = request.MaxShopCount;
        entity.DiscountType = request.DiscountType;
        entity.DiscountValue = request.DiscountValue;
        entity.IsActive = request.IsActive;
        entity.Description = request.Description;
        entity.ModifiedOn = DateTimeOffset.UtcNow;
        entity.ModifiedBy = _currentUserService.UserId;

        _discountRuleRepository.Update(entity);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return entity.ToDto();
    }

    public async Task DeleteDiscountRuleAsync(Guid id, CancellationToken cancellationToken = default)
    {
        EnsurePlatformAdmin();

        var entity = await _discountRuleRepository.GetByIdAsync(id, cancellationToken)
            ?? throw new AppException("discount_rule_not_found", "Discount rule not found.", 404);

        _discountRuleRepository.Remove(entity);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
    }

    public async Task ProcessTrialExpiriesAsync(CancellationToken cancellationToken = default)
    {
        var now = DateTimeOffset.UtcNow;
        var expired = await _companySubscriptionRepository.Query()
            .Where(x => x.Status == SubscriptionStatus.TrialActive && x.TrialEndsOn.HasValue && x.TrialEndsOn.Value < now)
            .ToListAsync(cancellationToken);

        if (expired.Count == 0)
        {
            return;
        }

        foreach (var item in expired)
        {
            item.Status = SubscriptionStatus.TrialExpired;
            item.ModifiedOn = now;
            item.ModifiedBy = _currentUserService.UserId;
            _companySubscriptionRepository.Update(item);

            await _billingEventRepository.AddAsync(new BillingEvent
            {
                CompanyId = item.CompanyId,
                CompanySubscriptionId = item.Id,
                EventType = BillingEventType.TrialExpired,
                Description = "Trial period expired.",
                CreatedOn = now,
                CreatedBy = _currentUserService.UserId
            }, cancellationToken);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);
    }

    private async Task ProcessTrialExpiryForCompanyAsync(Guid companyId, CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        var trial = await _companySubscriptionRepository.Query()
            .FirstOrDefaultAsync(
                x => x.CompanyId == companyId &&
                     x.Status == SubscriptionStatus.TrialActive &&
                     x.TrialEndsOn.HasValue &&
                     x.TrialEndsOn.Value < now,
                cancellationToken);

        if (trial is null)
        {
            return;
        }

        trial.Status = SubscriptionStatus.TrialExpired;
        trial.ModifiedOn = now;
        trial.ModifiedBy = _currentUserService.UserId;
        _companySubscriptionRepository.Update(trial);

        await _billingEventRepository.AddAsync(new BillingEvent
        {
            CompanyId = trial.CompanyId,
            CompanySubscriptionId = trial.Id,
            EventType = BillingEventType.TrialExpired,
            Description = "Trial period expired.",
            CreatedOn = now,
            CreatedBy = _currentUserService.UserId
        }, cancellationToken);

        await _unitOfWork.SaveChangesAsync(cancellationToken);
    }

    private async Task<CompanySubscription> GetCurrentSubscriptionAsync(Guid companyId, CancellationToken cancellationToken)
    {
        return await _companySubscriptionRepository.Query()
            .Include(x => x.SubscriptionPlan)
            .FirstOrDefaultAsync(x => x.CompanyId == companyId, cancellationToken)
            ?? throw new AppException("subscription_not_found", "Subscription not found for company.", 404);
    }

    private async Task<SubscriptionSummaryDto> BuildSummaryAsync(CompanySubscription subscription, CancellationToken cancellationToken)
    {
        var activeShopCount = await _shopRepository.Query()
            .AsNoTracking()
            .CountAsync(
                x => x.CompanyId == subscription.CompanyId &&
                     x.IsActive &&
                     !x.IsDeleted,
                cancellationToken);

        if (subscription.ActiveShopCount != activeShopCount)
        {
            var recalculation = await _calculationService.CalculateAsync(subscription.CompanyId, subscription.SubscriptionPlanId, cancellationToken);
            subscription.ActiveShopCount = recalculation.ActiveShopCount;
            subscription.PricePerShop = recalculation.PricePerShop;
            subscription.SubTotalAmount = recalculation.SubTotalAmount;
            subscription.DiscountAmount = recalculation.DiscountAmount;
            subscription.DiscountPercentage = recalculation.DiscountPercentage;
            subscription.TotalAmount = recalculation.TotalAmount;
            subscription.ModifiedOn = DateTimeOffset.UtcNow;
            subscription.ModifiedBy = _currentUserService.UserId;
            _companySubscriptionRepository.Update(subscription);

            await _billingEventRepository.AddAsync(new BillingEvent
            {
                CompanyId = subscription.CompanyId,
                CompanySubscriptionId = subscription.Id,
                EventType = BillingEventType.ShopCountChanged,
                Description = "Subscription recalculated because active shop count changed.",
                NewValue = activeShopCount.ToString(),
                CreatedOn = DateTimeOffset.UtcNow,
                CreatedBy = _currentUserService.UserId
            }, cancellationToken);

            await _unitOfWork.SaveChangesAsync(cancellationToken);
        }

        var trialDaysRemaining = subscription.Status == SubscriptionStatus.TrialActive && subscription.TrialEndsOn.HasValue
            ? (int?)Math.Max(0, (int)Math.Ceiling((subscription.TrialEndsOn.Value - DateTimeOffset.UtcNow).TotalDays))
            : null;

        var requiresBillingAction = subscription.Status is SubscriptionStatus.TrialExpired
            or SubscriptionStatus.Expired
            or SubscriptionStatus.Suspended
            or SubscriptionStatus.PaymentFailed
            or SubscriptionStatus.PastDue;

        return new SubscriptionSummaryDto
        {
            CompanyId = subscription.CompanyId,
            CompanySubscriptionId = subscription.Id,
            SubscriptionPlanId = subscription.SubscriptionPlanId,
            PlanName = subscription.SubscriptionPlan.Name,
            BillingCycle = subscription.BillingCycle,
            Status = subscription.Status,
            ActiveShopCount = subscription.ActiveShopCount,
            PricePerShop = subscription.PricePerShop,
            SubTotalAmount = subscription.SubTotalAmount,
            DiscountPercentage = subscription.DiscountPercentage,
            DiscountAmount = subscription.DiscountAmount,
            TotalAmount = subscription.TotalAmount,
            TrialStartedOn = subscription.TrialStartedOn,
            TrialEndsOn = subscription.TrialEndsOn,
            CurrentPeriodStartedOn = subscription.CurrentPeriodStartedOn,
            CurrentPeriodEndsOn = subscription.CurrentPeriodEndsOn,
            TrialDaysRemaining = trialDaysRemaining,
            RequiresBillingAction = requiresBillingAction
        };
    }

    private async Task EnsureCompanyAccessAsync(Guid companyId, CancellationToken cancellationToken)
    {
        _ = await _companyRepository.Query()
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == companyId && !x.IsDeleted, cancellationToken)
            ?? throw new AppException("company_not_found", "Company not found.", 404);

        if (_currentUserService.IsInRole(RoleNames.PlatformAdmin))
        {
            return;
        }

        if (!_currentUserService.UserId.HasValue)
        {
            throw new AppException("unauthorized", "User context is missing.", 401);
        }

        var hasAccess = await _shopUserRepository.Query()
            .AsNoTracking()
            .AnyAsync(
                x => x.UserId == _currentUserService.UserId.Value &&
                     x.IsActive &&
                     x.Shop.CompanyId == companyId,
                cancellationToken);

        if (!hasAccess)
        {
            throw new AppException(ErrorCodes.UnauthorizedRole, "You do not have access to this company.", 403);
        }
    }

    private void EnsurePlatformAdmin()
    {
        if (!_currentUserService.IsInRole(RoleNames.PlatformAdmin))
        {
            throw new AppException("unauthorized_role", "Platform admin role is required.", 403);
        }
    }

    private static void ValidateDiscountRule(UpsertSubscriptionDiscountRuleRequest request)
    {
        if (request.MinShopCount < 1)
        {
            throw new AppException("validation_failed", "Min shop count must be greater than zero.", 400);
        }

        if (request.MaxShopCount.HasValue && request.MaxShopCount.Value < request.MinShopCount)
        {
            throw new AppException("validation_failed", "Max shop count must be greater than or equal to min shop count.", 400);
        }

        if (request.DiscountType == DiscountType.Percentage && (request.DiscountValue < 0 || request.DiscountValue > 100))
        {
            throw new AppException("validation_failed", "Discount percentage must be between 0 and 100.", 400);
        }

        if (request.DiscountType == DiscountType.FixedAmountPerShop && request.DiscountValue < 0)
        {
            throw new AppException("validation_failed", "Fixed amount per shop cannot be negative.", 400);
        }
    }
}
