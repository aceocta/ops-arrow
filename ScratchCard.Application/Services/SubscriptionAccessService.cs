using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Services;
using ScratchCard.Domain.Entities;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.Services;

public class SubscriptionAccessService : ISubscriptionAccessService
{
    private readonly IRepository<ShopUser> _shopUserRepository;
    private readonly IRepository<CompanySubscription> _companySubscriptionRepository;

    public SubscriptionAccessService(
        IRepository<ShopUser> shopUserRepository,
        IRepository<CompanySubscription> companySubscriptionRepository)
    {
        _shopUserRepository = shopUserRepository;
        _companySubscriptionRepository = companySubscriptionRepository;
    }

    public async Task<SubscriptionAccessResult> GetAccessResultAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var companyIds = await _shopUserRepository.Query()
            .AsNoTracking()
            .Where(x => x.UserId == userId && x.IsActive && x.Shop.CompanyId != null)
            .Select(x => x.Shop.CompanyId!.Value)
            .Distinct()
            .ToListAsync(cancellationToken);

        if (companyIds.Count == 0)
        {
            return new SubscriptionAccessResult { IsAllowed = true };
        }

        var subscriptions = await _companySubscriptionRepository.Query()
            .AsNoTracking()
            .Where(x => companyIds.Contains(x.CompanyId))
            .ToListAsync(cancellationToken);

        if (subscriptions.Count == 0)
        {
            // Backward-compatibility path for pre-subscription data.
            return new SubscriptionAccessResult { IsAllowed = true };
        }

        var now = DateTimeOffset.UtcNow;
        var effectiveStatuses = subscriptions
            .Select(x =>
                x.Status == SubscriptionStatus.TrialActive && x.TrialEndsOn.HasValue && x.TrialEndsOn.Value < now
                    ? SubscriptionStatus.TrialExpired
                    : x.Status)
            .ToArray();

        var hasFullAccess = effectiveStatuses.Any(x =>
            x == SubscriptionStatus.TrialActive ||
            x == SubscriptionStatus.Active);

        if (hasFullAccess)
        {
            return new SubscriptionAccessResult { IsAllowed = true };
        }

        if (effectiveStatuses.Any(x => x == SubscriptionStatus.TrialExpired))
        {
            return new SubscriptionAccessResult
            {
                IsAllowed = false,
                BlockingStatus = SubscriptionStatus.TrialExpired
            };
        }

        var blockingStatus = effectiveStatuses
            .FirstOrDefault(x =>
                x == SubscriptionStatus.PastDue ||
                x == SubscriptionStatus.PaymentFailed ||
                x == SubscriptionStatus.Cancelled ||
                x == SubscriptionStatus.Expired ||
                x == SubscriptionStatus.Suspended);

        return new SubscriptionAccessResult
        {
            IsAllowed = false,
            BlockingStatus = blockingStatus == 0 ? SubscriptionStatus.Expired : blockingStatus
        };
    }
}
