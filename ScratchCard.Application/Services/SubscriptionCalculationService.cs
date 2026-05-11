using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Subscriptions;
using ScratchCard.Domain.Entities;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.Services;

public class SubscriptionCalculationService : ISubscriptionCalculationService
{
    private readonly IRepository<Company> _companyRepository;
    private readonly IRepository<Shop> _shopRepository;
    private readonly IRepository<SubscriptionPlan> _planRepository;
    private readonly IRepository<SubscriptionDiscountRule> _discountRuleRepository;

    public SubscriptionCalculationService(
        IRepository<Company> companyRepository,
        IRepository<Shop> shopRepository,
        IRepository<SubscriptionPlan> planRepository,
        IRepository<SubscriptionDiscountRule> discountRuleRepository)
    {
        _companyRepository = companyRepository;
        _shopRepository = shopRepository;
        _planRepository = planRepository;
        _discountRuleRepository = discountRuleRepository;
    }

    public async Task<SubscriptionCalculationResultDto> CalculateAsync(
        Guid companyId,
        Guid planId,
        CancellationToken cancellationToken = default)
    {
        _ = await _companyRepository.Query()
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == companyId && !x.IsDeleted, cancellationToken)
            ?? throw new AppException("company_not_found", "Company not found.", 404);

        var plan = await _planRepository.Query()
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == planId && x.IsActive, cancellationToken)
            ?? throw new AppException("subscription_plan_not_found", "Subscription plan not found or inactive.", 404);

        var activeShopCount = await _shopRepository.Query()
            .AsNoTracking()
            .CountAsync(
                x => x.CompanyId == companyId &&
                     x.IsActive &&
                     !x.IsDeleted,
                cancellationToken);

        var subTotalAmount = activeShopCount * plan.PricePerShop;

        var discountRule = await _discountRuleRepository.Query()
            .AsNoTracking()
            .Where(x =>
                x.IsActive &&
                (x.SubscriptionPlanId == null || x.SubscriptionPlanId == plan.Id) &&
                x.MinShopCount <= activeShopCount &&
                (!x.MaxShopCount.HasValue || activeShopCount <= x.MaxShopCount.Value))
            .OrderByDescending(x => x.MinShopCount)
            .ThenByDescending(x => x.DiscountValue)
            .FirstOrDefaultAsync(cancellationToken);

        decimal discountAmount = 0;
        decimal discountPercentage = 0;

        if (discountRule is not null && subTotalAmount > 0)
        {
            if (discountRule.DiscountType == DiscountType.Percentage)
            {
                discountPercentage = Math.Clamp(discountRule.DiscountValue, 0, 100);
                discountAmount = decimal.Round(subTotalAmount * (discountPercentage / 100m), 2, MidpointRounding.AwayFromZero);
            }
            else
            {
                discountAmount = decimal.Round(activeShopCount * discountRule.DiscountValue, 2, MidpointRounding.AwayFromZero);
                discountPercentage = subTotalAmount <= 0
                    ? 0
                    : decimal.Round((discountAmount / subTotalAmount) * 100m, 4, MidpointRounding.AwayFromZero);
            }
        }

        if (discountAmount < 0)
        {
            discountAmount = 0;
        }

        if (discountAmount > subTotalAmount)
        {
            discountAmount = subTotalAmount;
        }

        var totalAmount = subTotalAmount - discountAmount;

        return new SubscriptionCalculationResultDto
        {
            PlanName = plan.Name,
            BillingCycle = plan.BillingCycle,
            ActiveShopCount = activeShopCount,
            PricePerShop = plan.PricePerShop,
            SubTotalAmount = subTotalAmount,
            DiscountPercentage = discountPercentage,
            DiscountAmount = discountAmount,
            TotalAmount = totalAmount
        };
    }
}
