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
        // Single query (EXISTS subquery) instead of fetching the user's company IDs and then their
        // subscriptions separately — this runs on every authenticated request, so halving its DB
        // round trips matters. Behaviour is unchanged: an empty result (no company memberships, or
        // companies with no subscription rows) still falls through to the allowed default below.
        var subscriptions = await _companySubscriptionRepository.Query()
            .AsNoTracking()
            .Where(x => _shopUserRepository.Query()
                .Any(su => su.UserId == userId && su.IsActive && su.Shop.CompanyId == x.CompanyId))
            .ToListAsync(cancellationToken);

        if (subscriptions.Count == 0)
        {
            // No company membership, or pre-subscription data — allow (backward compatible).
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
