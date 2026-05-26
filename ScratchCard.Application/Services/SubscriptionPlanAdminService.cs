using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Subscriptions;
using ScratchCard.Domain.Entities;

namespace ScratchCard.Application.Services;

public class SubscriptionPlanAdminService : ISubscriptionPlanAdminService
{
    // Sentinel value callers can send for the nullable int fields (MaxUsers /
    // ReportExportsPerMonth) to mean "set to unlimited" — JSON null is ambiguous (do you mean
    // "don't change" or "set to null"?), so we use -1 to mean "set to unlimited (null in DB)".
    private const int UnlimitedSentinel = -1;

    private readonly IRepository<SubscriptionPlan> _planRepository;
    private readonly ICurrentUserService _currentUserService;
    private readonly IAuditService _auditService;
    private readonly IUnitOfWork _unitOfWork;

    public SubscriptionPlanAdminService(
        IRepository<SubscriptionPlan> planRepository,
        ICurrentUserService currentUserService,
        IAuditService auditService,
        IUnitOfWork unitOfWork)
    {
        _planRepository = planRepository;
        _currentUserService = currentUserService;
        _auditService = auditService;
        _unitOfWork = unitOfWork;
    }

    public async Task<IReadOnlyCollection<SubscriptionPlanDto>> ListAllAsync(CancellationToken cancellationToken = default)
    {
        // Admin view includes inactive plans so the operator can re-activate or audit them.
        var plans = await _planRepository.Query()
            .AsNoTracking()
            .OrderBy(p => p.BillingCycle)
            .ThenBy(p => p.PricePerShop)
            .ToListAsync(cancellationToken);

        return plans.Select(p => p.ToDto()).ToArray();
    }

    public async Task<SubscriptionPlanDto> UpdateAsync(Guid planId, UpdateSubscriptionPlanRequest request, CancellationToken cancellationToken = default)
    {
        var plan = await _planRepository.GetByIdAsync(planId, cancellationToken)
            ?? throw new AppException("plan_not_found", "Subscription plan not found.", 404);

        var changes = new List<string>();

        if (request.Name is not null && !string.Equals(plan.Name, request.Name, StringComparison.Ordinal))
        {
            var trimmed = request.Name.Trim();
            if (trimmed.Length == 0) throw new AppException("validation_failed", "Plan name cannot be empty.", 400);
            changes.Add($"name '{plan.Name}' -> '{trimmed}'");
            plan.Name = trimmed;
        }

        if (request.PricePerShop.HasValue && plan.PricePerShop != request.PricePerShop.Value)
        {
            if (request.PricePerShop.Value < 0) throw new AppException("validation_failed", "Price cannot be negative.", 400);
            changes.Add($"price {plan.PricePerShop} -> {request.PricePerShop.Value}");
            plan.PricePerShop = request.PricePerShop.Value;
        }

        if (request.TrialDays.HasValue && plan.TrialDays != request.TrialDays.Value)
        {
            if (request.TrialDays.Value < 0) throw new AppException("validation_failed", "Trial days cannot be negative.", 400);
            changes.Add($"trialDays {plan.TrialDays} -> {request.TrialDays.Value}");
            plan.TrialDays = request.TrialDays.Value;
        }

        if (request.Description is not null && !string.Equals(plan.Description, request.Description, StringComparison.Ordinal))
        {
            plan.Description = request.Description;
            changes.Add("description updated");
        }

        if (request.IncludedFeatures is not null)
        {
            var csv = string.Join(',', request.IncludedFeatures.Where(s => !string.IsNullOrWhiteSpace(s)).Select(s => s.Trim()).Distinct(StringComparer.OrdinalIgnoreCase));
            if (!string.Equals(plan.IncludedFeatures ?? string.Empty, csv, StringComparison.Ordinal))
            {
                plan.IncludedFeatures = csv;
                changes.Add($"includedFeatures -> {csv}");
            }
        }

        if (request.MaxUsers.HasValue)
        {
            int? next = request.MaxUsers.Value == UnlimitedSentinel ? null : request.MaxUsers.Value;
            if (next.HasValue && next.Value < 0) throw new AppException("validation_failed", "MaxUsers cannot be negative. Use -1 for unlimited.", 400);
            if (plan.MaxUsers != next)
            {
                changes.Add($"maxUsers {plan.MaxUsers?.ToString() ?? "unlimited"} -> {next?.ToString() ?? "unlimited"}");
                plan.MaxUsers = next;
            }
        }

        if (request.ReportExportsPerMonth.HasValue)
        {
            int? next = request.ReportExportsPerMonth.Value == UnlimitedSentinel ? null : request.ReportExportsPerMonth.Value;
            if (next.HasValue && next.Value < 0) throw new AppException("validation_failed", "ReportExportsPerMonth cannot be negative. Use -1 for unlimited.", 400);
            if (plan.ReportExportsPerMonth != next)
            {
                changes.Add($"reportExportsPerMonth {plan.ReportExportsPerMonth?.ToString() ?? "unlimited"} -> {next?.ToString() ?? "unlimited"}");
                plan.ReportExportsPerMonth = next;
            }
        }

        if (request.AppleProductId is not null && plan.AppleProductId != request.AppleProductId)
        {
            plan.AppleProductId = string.IsNullOrWhiteSpace(request.AppleProductId) ? null : request.AppleProductId.Trim();
            changes.Add($"appleProductId -> {plan.AppleProductId ?? "<null>"}");
        }

        if (request.GoogleProductId is not null && plan.GoogleProductId != request.GoogleProductId)
        {
            plan.GoogleProductId = string.IsNullOrWhiteSpace(request.GoogleProductId) ? null : request.GoogleProductId.Trim();
            changes.Add($"googleProductId -> {plan.GoogleProductId ?? "<null>"}");
        }

        if (request.IsActive.HasValue && plan.IsActive != request.IsActive.Value)
        {
            changes.Add($"isActive {plan.IsActive} -> {request.IsActive.Value}");
            plan.IsActive = request.IsActive.Value;
        }

        if (changes.Count == 0)
        {
            return plan.ToDto();
        }

        plan.ModifiedOn = DateTimeOffset.UtcNow;
        plan.ModifiedBy = _currentUserService.UserId;
        _planRepository.Update(plan);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(
            entityName: nameof(SubscriptionPlan),
            entityId: plan.Id,
            actionType: "SubscriptionPlanUpdated",
            newValue: string.Join("; ", changes),
            cancellationToken: cancellationToken);

        return plan.ToDto();
    }
}
