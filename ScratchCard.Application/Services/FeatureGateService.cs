using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Services;
using ScratchCard.Domain.Entities;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.Services;

public interface IFeatureGateService
{
    Task<bool> HasFeatureAsync(Guid shopId, string featureKey, CancellationToken cancellationToken = default);
    Task EnsureFeatureAsync(Guid shopId, string featureKey, CancellationToken cancellationToken = default);
    Task<int?> GetMaxUsersAsync(Guid shopId, CancellationToken cancellationToken = default);
    Task<int?> GetReportExportQuotaAsync(Guid shopId, CancellationToken cancellationToken = default);
    Task EnsureUserSeatAvailableAsync(Guid shopId, int additionalSeats, CancellationToken cancellationToken = default);
    Task EnsureReportExportAllowedAsync(Guid shopId, string reportType, CancellationToken cancellationToken = default);
}

public class FeatureGateService : IFeatureGateService
{
    private readonly IRepository<ShopSubscription> _shopSubscriptionRepository;
    private readonly IRepository<SubscriptionPlan> _planRepository;
    private readonly IRepository<ShopUser> _shopUserRepository;
    private readonly IRepository<UserInvitation> _userInvitationRepository;
    private readonly IRepository<ReportExportLog> _reportExportLogRepository;
    private readonly IUnitOfWork _unitOfWork;

    public FeatureGateService(
        IRepository<ShopSubscription> shopSubscriptionRepository,
        IRepository<SubscriptionPlan> planRepository,
        IRepository<ShopUser> shopUserRepository,
        IRepository<UserInvitation> userInvitationRepository,
        IRepository<ReportExportLog> reportExportLogRepository,
        IUnitOfWork unitOfWork)
    {
        _shopSubscriptionRepository = shopSubscriptionRepository;
        _planRepository = planRepository;
        _shopUserRepository = shopUserRepository;
        _userInvitationRepository = userInvitationRepository;
        _reportExportLogRepository = reportExportLogRepository;
        _unitOfWork = unitOfWork;
    }

    public async Task<bool> HasFeatureAsync(Guid shopId, string featureKey, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(featureKey)) return true;
        var plan = await ResolveActivePlanAsync(shopId, cancellationToken);
        if (plan is null) return false;
        var features = ParseFeatures(plan.IncludedFeatures);
        return features.Contains(featureKey, StringComparer.OrdinalIgnoreCase);
    }

    public async Task EnsureFeatureAsync(Guid shopId, string featureKey, CancellationToken cancellationToken = default)
    {
        if (!await HasFeatureAsync(shopId, featureKey, cancellationToken))
        {
            throw new AppException(
                "feature_not_in_plan",
                $"This action requires the '{featureKey}' feature, which is not included in your current subscription. Please upgrade the shop's plan.",
                403);
        }
    }

    public async Task<int?> GetMaxUsersAsync(Guid shopId, CancellationToken cancellationToken = default)
    {
        var plan = await ResolveActivePlanAsync(shopId, cancellationToken);
        return plan?.MaxUsers;
    }

    public async Task<int?> GetReportExportQuotaAsync(Guid shopId, CancellationToken cancellationToken = default)
    {
        var plan = await ResolveActivePlanAsync(shopId, cancellationToken);
        return plan?.ReportExportsPerMonth;
    }

    public async Task EnsureUserSeatAvailableAsync(Guid shopId, int additionalSeats, CancellationToken cancellationToken = default)
    {
        var max = await GetMaxUsersAsync(shopId, cancellationToken);
        if (max is null) return; // null = unlimited

        // Count active ShopUser rows + outstanding pending invitations targeting this shop.
        var assigned = await _shopUserRepository.Query()
            .CountAsync(u => u.ShopId == shopId && u.IsActive, cancellationToken);

        var pendingInvites = await _userInvitationRepository.Query()
            .CountAsync(i => i.ShopId == shopId && i.Status == InvitationStatus.Pending, cancellationToken);

        var projected = assigned + pendingInvites + additionalSeats;
        if (projected > max.Value)
        {
            throw new AppException(
                "user_seat_limit_reached",
                $"This shop's subscription includes {max.Value} user seats; {assigned} are assigned and {pendingInvites} are pending. Upgrade to add more.",
                403);
        }
    }

    public async Task EnsureReportExportAllowedAsync(Guid shopId, string reportType, CancellationToken cancellationToken = default)
    {
        var quota = await GetReportExportQuotaAsync(shopId, cancellationToken);
        if (quota is null) return; // null = unlimited

        var now = DateTimeOffset.UtcNow;
        var monthStart = new DateTimeOffset(now.Year, now.Month, 1, 0, 0, 0, TimeSpan.Zero);

        var usedThisMonth = await _reportExportLogRepository.Query()
            .CountAsync(x => x.ShopId == shopId
                             && x.ReportType == reportType
                             && x.ExportedOn >= monthStart,
                cancellationToken);

        if (usedThisMonth >= quota.Value)
        {
            throw new AppException(
                "report_export_quota_exceeded",
                $"This shop's plan includes {quota.Value} '{reportType}' exports per month and the limit has been reached. Upgrade to export more.",
                403);
        }

        await _reportExportLogRepository.AddAsync(new ReportExportLog
        {
            ShopId = shopId,
            ReportType = reportType,
            ExportedOn = now,
        }, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
    }

    private async Task<SubscriptionPlan?> ResolveActivePlanAsync(Guid shopId, CancellationToken cancellationToken)
    {
        var subscription = await _shopSubscriptionRepository.Query()
            .Where(x => x.ShopId == shopId)
            .OrderByDescending(x => x.CreatedOn)
            .FirstOrDefaultAsync(cancellationToken);

        if (subscription is null) return null;

        // Trial/Active/Past-due count as "in scope" — gates are enforced as long as the shop is not
        // outright cancelled or expired. PaymentFailed/PastDue keep features unlocked during the
        // grace window so the user can recover.
        var inScope = subscription.Status == SubscriptionStatus.Active
            || subscription.Status == SubscriptionStatus.TrialActive
            || subscription.Status == SubscriptionStatus.PastDue
            || subscription.Status == SubscriptionStatus.PaymentFailed;
        if (!inScope) return null;

        if (!subscription.SubscriptionPlanId.HasValue) return null;
        return await _planRepository.GetByIdAsync(subscription.SubscriptionPlanId.Value, cancellationToken);
    }

    private static IReadOnlyCollection<string> ParseFeatures(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return Array.Empty<string>();
        return raw
            .Split(new[] { ',', ';', '\n' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }
}
