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
    private readonly IRepository<Feature> _featureRepository;
    private readonly IRepository<SubscriptionPlanFeature> _planFeatureRepository;
    private readonly IRepository<CfgSubscriptionSettings> _subscriptionSettingsRepository;
    private readonly ICurrentUserService _currentUserService;
    private readonly IAuditService _auditService;
    private readonly IUnitOfWork _unitOfWork;

    public SubscriptionPlanAdminService(
        IRepository<SubscriptionPlan> planRepository,
        IRepository<Feature> featureRepository,
        IRepository<SubscriptionPlanFeature> planFeatureRepository,
        IRepository<CfgSubscriptionSettings> subscriptionSettingsRepository,
        ICurrentUserService currentUserService,
        IAuditService auditService,
        IUnitOfWork unitOfWork)
    {
        _planRepository = planRepository;
        _featureRepository = featureRepository;
        _planFeatureRepository = planFeatureRepository;
        _subscriptionSettingsRepository = subscriptionSettingsRepository;
        _currentUserService = currentUserService;
        _auditService = auditService;
        _unitOfWork = unitOfWork;
    }

    public async Task<IReadOnlyCollection<SubscriptionPlanDto>> ListAllAsync(CancellationToken cancellationToken = default)
    {
        // Admin view includes inactive plans so the operator can re-activate or audit them.
        var plans = await _planRepository.Query()
            .AsNoTracking()
            .Include(p => p.PlanFeatures).ThenInclude(pf => pf.Feature)
            .OrderBy(p => p.BillingCycle)
            .ThenBy(p => p.PricePerShop)
            .ToListAsync(cancellationToken);

        return plans.Select(p => p.ToDto()).ToArray();
    }

    public async Task<SubscriptionPlanDto> UpdateAsync(Guid planId, UpdateSubscriptionPlanRequest request, CancellationToken cancellationToken = default)
    {
        var plan = await _planRepository.Query()
            .Include(p => p.PlanFeatures).ThenInclude(pf => pf.Feature)
            .FirstOrDefaultAsync(p => p.Id == planId, cancellationToken)
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
            var diff = await ReplacePlanFeaturesByKeyAsync(plan, request.IncludedFeatures, cancellationToken);
            if (diff is not null)
            {
                changes.Add(diff);
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

        if (request.StripePriceId is not null && plan.StripePriceId != request.StripePriceId)
        {
            plan.StripePriceId = string.IsNullOrWhiteSpace(request.StripePriceId) ? null : request.StripePriceId.Trim();
            changes.Add($"stripePriceId -> {plan.StripePriceId ?? "<null>"}");
        }

        if (request.DisplayOrder.HasValue && plan.DisplayOrder != request.DisplayOrder.Value)
        {
            changes.Add($"displayOrder {plan.DisplayOrder} -> {request.DisplayOrder.Value}");
            plan.DisplayOrder = request.DisplayOrder.Value;
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

    public async Task<IReadOnlyCollection<SubscriptionPlanFeatureDto>> ListPlanFeaturesAsync(Guid planId, CancellationToken cancellationToken = default)
    {
        _ = await _planRepository.Query()
            .AsNoTracking()
            .AnyAsync(p => p.Id == planId, cancellationToken)
            ? true
            : throw new AppException("plan_not_found", "Subscription plan not found.", 404);

        var rows = await _planFeatureRepository.Query()
            .AsNoTracking()
            .Include(pf => pf.Feature)
            .Where(pf => pf.SubscriptionPlanId == planId)
            .OrderBy(pf => pf.Feature.Category)
            .ThenBy(pf => pf.Feature.DisplayOrder)
            .ToListAsync(cancellationToken);

        return rows.Select(x => x.ToDto()).ToArray();
    }

    public async Task<SubscriptionPlanFeatureDto> UpsertPlanFeatureAsync(Guid planId, UpsertPlanFeatureRequest request, CancellationToken cancellationToken = default)
    {
        var plan = await _planRepository.Query()
            .Include(p => p.PlanFeatures).ThenInclude(pf => pf.Feature)
            .FirstOrDefaultAsync(p => p.Id == planId, cancellationToken)
            ?? throw new AppException("plan_not_found", "Subscription plan not found.", 404);

        var feature = await _featureRepository.GetByIdAsync(request.FeatureId, cancellationToken)
            ?? throw new AppException("feature_not_found", "Feature not found.", 404);

        var existing = plan.PlanFeatures.FirstOrDefault(pf => pf.FeatureId == feature.Id);
        var now = DateTimeOffset.UtcNow;

        if (existing is null)
        {
            existing = new SubscriptionPlanFeature
            {
                SubscriptionPlanId = plan.Id,
                FeatureId = feature.Id,
                IsEnabled = request.IsEnabled,
                LimitValue = request.LimitValue,
                Notes = request.Notes,
                CreatedOn = now,
                CreatedBy = _currentUserService.UserId,
                Feature = feature
            };
            plan.PlanFeatures.Add(existing);
        }
        else
        {
            existing.IsEnabled = request.IsEnabled;
            existing.LimitValue = request.LimitValue;
            existing.Notes = request.Notes;
            existing.ModifiedOn = now;
            existing.ModifiedBy = _currentUserService.UserId;
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(
            entityName: nameof(SubscriptionPlanFeature),
            entityId: existing.Id,
            actionType: "PlanFeatureUpserted",
            newValue: $"plan={plan.Id}; feature={feature.Key}; enabled={existing.IsEnabled}; limit={existing.LimitValue?.ToString() ?? "<null>"}",
            cancellationToken: cancellationToken);

        return existing.ToDto();
    }

    public async Task RemovePlanFeatureAsync(Guid planId, Guid featureId, CancellationToken cancellationToken = default)
    {
        var row = await _planFeatureRepository.Query()
            .Include(pf => pf.Feature)
            .FirstOrDefaultAsync(pf => pf.SubscriptionPlanId == planId && pf.FeatureId == featureId, cancellationToken);

        if (row is null) return;

        var key = row.Feature?.Key ?? featureId.ToString();
        _planFeatureRepository.Remove(row);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(
            entityName: nameof(SubscriptionPlanFeature),
            entityId: row.Id,
            actionType: "PlanFeatureRemoved",
            newValue: $"plan={planId}; feature={key}",
            cancellationToken: cancellationToken);
    }

    public async Task<IReadOnlyCollection<SubscriptionPlanFeatureDto>> SetPlanFeaturesAsync(Guid planId, SetPlanFeaturesRequest request, CancellationToken cancellationToken = default)
    {
        var plan = await _planRepository.Query()
            .Include(p => p.PlanFeatures).ThenInclude(pf => pf.Feature)
            .FirstOrDefaultAsync(p => p.Id == planId, cancellationToken)
            ?? throw new AppException("plan_not_found", "Subscription plan not found.", 404);

        var requestedIds = request.Features.Select(x => x.FeatureId).ToHashSet();
        var features = await _featureRepository.Query()
            .Where(f => requestedIds.Contains(f.Id))
            .ToDictionaryAsync(f => f.Id, cancellationToken);

        var missing = requestedIds.Where(id => !features.ContainsKey(id)).ToArray();
        if (missing.Length > 0)
        {
            throw new AppException("feature_not_found", $"Unknown feature ID(s): {string.Join(",", missing)}.", 404);
        }

        var now = DateTimeOffset.UtcNow;
        var byFeatureId = plan.PlanFeatures.ToDictionary(pf => pf.FeatureId);

        // Remove anything not in the new set.
        foreach (var existing in plan.PlanFeatures.ToList())
        {
            if (!requestedIds.Contains(existing.FeatureId))
            {
                plan.PlanFeatures.Remove(existing);
                _planFeatureRepository.Remove(existing);
            }
        }

        // Upsert each requested feature.
        foreach (var item in request.Features)
        {
            if (byFeatureId.TryGetValue(item.FeatureId, out var existing))
            {
                existing.IsEnabled = item.IsEnabled;
                existing.LimitValue = item.LimitValue;
                existing.Notes = item.Notes;
                existing.ModifiedOn = now;
                existing.ModifiedBy = _currentUserService.UserId;
            }
            else
            {
                plan.PlanFeatures.Add(new SubscriptionPlanFeature
                {
                    SubscriptionPlanId = plan.Id,
                    FeatureId = item.FeatureId,
                    IsEnabled = item.IsEnabled,
                    LimitValue = item.LimitValue,
                    Notes = item.Notes,
                    CreatedOn = now,
                    CreatedBy = _currentUserService.UserId,
                    Feature = features[item.FeatureId]
                });
            }
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(
            entityName: nameof(SubscriptionPlan),
            entityId: plan.Id,
            actionType: "PlanFeaturesReplaced",
            newValue: $"plan={plan.Id}; features={string.Join(",", request.Features.Select(x => x.FeatureId))}",
            cancellationToken: cancellationToken);

        return plan.PlanFeatures
            .OrderBy(pf => pf.Feature?.Category)
            .ThenBy(pf => pf.Feature?.DisplayOrder)
            .Select(pf => pf.ToDto())
            .ToArray();
    }

    private async Task<string?> ReplacePlanFeaturesByKeyAsync(SubscriptionPlan plan, IReadOnlyCollection<string> featureKeys, CancellationToken cancellationToken)
    {
        var normalised = featureKeys
            .Where(k => !string.IsNullOrWhiteSpace(k))
            .Select(k => k.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        var features = await _featureRepository.Query()
            .Where(f => normalised.Contains(f.Key))
            .ToListAsync(cancellationToken);

        var unknown = normalised.Where(k => !features.Any(f => string.Equals(f.Key, k, StringComparison.OrdinalIgnoreCase))).ToArray();
        if (unknown.Length > 0)
        {
            throw new AppException("feature_not_found", $"Unknown feature key(s): {string.Join(",", unknown)}.", 404);
        }

        var targetIds = features.Select(f => f.Id).ToHashSet();
        var currentIds = plan.PlanFeatures.Select(pf => pf.FeatureId).ToHashSet();
        if (targetIds.SetEquals(currentIds) && plan.PlanFeatures.All(pf => pf.IsEnabled))
        {
            return null;
        }

        var now = DateTimeOffset.UtcNow;
        foreach (var existing in plan.PlanFeatures.ToList())
        {
            if (!targetIds.Contains(existing.FeatureId))
            {
                plan.PlanFeatures.Remove(existing);
                _planFeatureRepository.Remove(existing);
            }
            else
            {
                existing.IsEnabled = true;
                existing.ModifiedOn = now;
                existing.ModifiedBy = _currentUserService.UserId;
            }
        }

        foreach (var feature in features)
        {
            if (!currentIds.Contains(feature.Id))
            {
                plan.PlanFeatures.Add(new SubscriptionPlanFeature
                {
                    SubscriptionPlanId = plan.Id,
                    FeatureId = feature.Id,
                    IsEnabled = true,
                    CreatedOn = now,
                    CreatedBy = _currentUserService.UserId,
                    Feature = feature
                });
            }
        }

        return $"includedFeatures -> {string.Join(",", features.Select(f => f.Key))}";
    }

    public async Task<GlobalSubscriptionSettingsDto> GetGlobalSettingsAsync(CancellationToken cancellationToken = default)
    {
        var settings = await LoadOrCreateGlobalSettingsAsync(cancellationToken);
        return MapGlobalSettings(settings);
    }

    public async Task<GlobalSubscriptionSettingsDto> UpdateGlobalSettingsAsync(UpdateGlobalSubscriptionSettingsRequest request, CancellationToken cancellationToken = default)
    {
        var settings = await LoadOrCreateGlobalSettingsAsync(cancellationToken);
        var changes = new List<string>();

        if (request.DefaultTrialDays.HasValue && settings.DefaultTrialDays != request.DefaultTrialDays.Value)
        {
            if (request.DefaultTrialDays.Value < 0)
            {
                throw new AppException("validation_failed", "DefaultTrialDays cannot be negative.", 400);
            }
            changes.Add($"defaultTrialDays {settings.DefaultTrialDays} -> {request.DefaultTrialDays.Value}");
            settings.DefaultTrialDays = request.DefaultTrialDays.Value;
        }

        if (request.TrialEndingReminderDays.HasValue && settings.TrialEndingReminderDays != request.TrialEndingReminderDays.Value)
        {
            if (request.TrialEndingReminderDays.Value < 0)
            {
                throw new AppException("validation_failed", "TrialEndingReminderDays cannot be negative.", 400);
            }
            changes.Add($"trialEndingReminderDays {settings.TrialEndingReminderDays} -> {request.TrialEndingReminderDays.Value}");
            settings.TrialEndingReminderDays = request.TrialEndingReminderDays.Value;
        }

        if (request.PaymentGracePeriodDays.HasValue && settings.PaymentGracePeriodDays != request.PaymentGracePeriodDays.Value)
        {
            if (request.PaymentGracePeriodDays.Value < 0)
            {
                throw new AppException("validation_failed", "PaymentGracePeriodDays cannot be negative.", 400);
            }
            changes.Add($"paymentGracePeriodDays {settings.PaymentGracePeriodDays} -> {request.PaymentGracePeriodDays.Value}");
            settings.PaymentGracePeriodDays = request.PaymentGracePeriodDays.Value;
        }

        if (request.BulkDiscountEnabled.HasValue && settings.BulkDiscountEnabled != request.BulkDiscountEnabled.Value)
        {
            changes.Add($"bulkDiscountEnabled {settings.BulkDiscountEnabled} -> {request.BulkDiscountEnabled.Value}");
            settings.BulkDiscountEnabled = request.BulkDiscountEnabled.Value;
        }

        if (changes.Count == 0)
        {
            return MapGlobalSettings(settings);
        }

        settings.ModifiedOn = DateTimeOffset.UtcNow;
        settings.ModifiedBy = _currentUserService.UserId;
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        await _auditService.LogAsync(
            entityName: nameof(CfgSubscriptionSettings),
            entityId: settings.Id,
            actionType: "GlobalSubscriptionSettingsUpdated",
            newValue: string.Join("; ", changes),
            cancellationToken: cancellationToken);

        return MapGlobalSettings(settings);
    }

    private async Task<CfgSubscriptionSettings> LoadOrCreateGlobalSettingsAsync(CancellationToken cancellationToken)
    {
        var existing = await _subscriptionSettingsRepository.Query()
            .Where(x => x.ShopId == null)
            .OrderByDescending(x => x.CreatedOn)
            .FirstOrDefaultAsync(cancellationToken);
        if (existing is not null) return existing;

        // First-time access on an old DB without a global record — seed with sensible defaults.
        var created = new CfgSubscriptionSettings
        {
            ShopId = null,
            DefaultTrialDays = 14,
            TrialEndingReminderDays = 3,
            PaymentGracePeriodDays = 7,
            BulkDiscountEnabled = false,
            CreatedOn = DateTimeOffset.UtcNow,
            CreatedBy = _currentUserService.UserId,
        };
        await _subscriptionSettingsRepository.AddAsync(created, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return created;
    }

    private static GlobalSubscriptionSettingsDto MapGlobalSettings(CfgSubscriptionSettings settings) => new()
    {
        DefaultTrialDays = settings.DefaultTrialDays,
        TrialEndingReminderDays = settings.TrialEndingReminderDays,
        PaymentGracePeriodDays = settings.PaymentGracePeriodDays,
        BulkDiscountEnabled = settings.BulkDiscountEnabled,
    };
}
