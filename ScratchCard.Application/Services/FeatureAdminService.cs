using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Subscriptions;
using ScratchCard.Domain.Entities;

namespace ScratchCard.Application.Services;

public class FeatureAdminService : IFeatureAdminService
{
    private readonly IRepository<Feature> _featureRepository;
    private readonly IRepository<SubscriptionPlanFeature> _planFeatureRepository;
    private readonly ICurrentUserService _currentUserService;
    private readonly IAuditService _auditService;
    private readonly IUnitOfWork _unitOfWork;

    public FeatureAdminService(
        IRepository<Feature> featureRepository,
        IRepository<SubscriptionPlanFeature> planFeatureRepository,
        ICurrentUserService currentUserService,
        IAuditService auditService,
        IUnitOfWork unitOfWork)
    {
        _featureRepository = featureRepository;
        _planFeatureRepository = planFeatureRepository;
        _currentUserService = currentUserService;
        _auditService = auditService;
        _unitOfWork = unitOfWork;
    }

    public async Task<IReadOnlyCollection<FeatureDto>> ListAsync(bool includeInactive, CancellationToken cancellationToken = default)
    {
        var query = _featureRepository.Query().AsNoTracking();
        if (!includeInactive) query = query.Where(f => f.IsActive);

        var features = await query
            .OrderBy(f => f.Category)
            .ThenBy(f => f.DisplayOrder)
            .ThenBy(f => f.Name)
            .ToListAsync(cancellationToken);

        return features.Select(f => f.ToDto()).ToArray();
    }

    public async Task<FeatureDto> CreateAsync(UpsertFeatureRequest request, CancellationToken cancellationToken = default)
    {
        ValidateRequest(request);

        var key = request.Key.Trim();
        var keyExists = await _featureRepository.Query().AnyAsync(f => f.Key == key, cancellationToken);
        if (keyExists)
        {
            throw new AppException("feature_key_conflict", $"A feature with key '{key}' already exists.", 409);
        }

        var feature = new Feature
        {
            Key = key,
            Name = request.Name.Trim(),
            Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim(),
            Category = string.IsNullOrWhiteSpace(request.Category) ? null : request.Category.Trim(),
            DisplayOrder = request.DisplayOrder,
            IsActive = request.IsActive,
            IsSystem = false,
            CreatedOn = DateTimeOffset.UtcNow,
            CreatedBy = _currentUserService.UserId
        };

        await _featureRepository.AddAsync(feature, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(
            entityName: nameof(Feature),
            entityId: feature.Id,
            actionType: "FeatureCreated",
            newValue: $"key={feature.Key}; name={feature.Name}",
            cancellationToken: cancellationToken);

        return feature.ToDto();
    }

    public async Task<FeatureDto> UpdateAsync(Guid id, UpsertFeatureRequest request, CancellationToken cancellationToken = default)
    {
        var feature = await _featureRepository.GetByIdAsync(id, cancellationToken)
            ?? throw new AppException("feature_not_found", "Feature not found.", 404);

        ValidateRequest(request);

        var changes = new List<string>();
        var trimmedKey = request.Key.Trim();
        if (!string.Equals(feature.Key, trimmedKey, StringComparison.Ordinal))
        {
            if (feature.IsSystem)
            {
                // System features are referenced from code by their key — renaming would break
                // gate checks silently. Block it.
                throw new AppException("feature_key_immutable", "Cannot rename a system feature key.", 400);
            }
            var conflict = await _featureRepository.Query().AnyAsync(f => f.Key == trimmedKey && f.Id != id, cancellationToken);
            if (conflict) throw new AppException("feature_key_conflict", $"A feature with key '{trimmedKey}' already exists.", 409);
            changes.Add($"key '{feature.Key}' -> '{trimmedKey}'");
            feature.Key = trimmedKey;
        }

        var trimmedName = request.Name.Trim();
        if (!string.Equals(feature.Name, trimmedName, StringComparison.Ordinal))
        {
            changes.Add($"name '{feature.Name}' -> '{trimmedName}'");
            feature.Name = trimmedName;
        }

        var newDescription = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();
        if (!string.Equals(feature.Description ?? string.Empty, newDescription ?? string.Empty, StringComparison.Ordinal))
        {
            feature.Description = newDescription;
            changes.Add("description updated");
        }

        var newCategory = string.IsNullOrWhiteSpace(request.Category) ? null : request.Category.Trim();
        if (!string.Equals(feature.Category ?? string.Empty, newCategory ?? string.Empty, StringComparison.Ordinal))
        {
            feature.Category = newCategory;
            changes.Add($"category -> {newCategory ?? "<null>"}");
        }

        if (feature.DisplayOrder != request.DisplayOrder)
        {
            changes.Add($"displayOrder {feature.DisplayOrder} -> {request.DisplayOrder}");
            feature.DisplayOrder = request.DisplayOrder;
        }

        if (feature.IsActive != request.IsActive)
        {
            changes.Add($"isActive {feature.IsActive} -> {request.IsActive}");
            feature.IsActive = request.IsActive;
        }

        if (changes.Count == 0)
        {
            return feature.ToDto();
        }

        feature.ModifiedOn = DateTimeOffset.UtcNow;
        feature.ModifiedBy = _currentUserService.UserId;
        _featureRepository.Update(feature);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(
            entityName: nameof(Feature),
            entityId: feature.Id,
            actionType: "FeatureUpdated",
            newValue: string.Join("; ", changes),
            cancellationToken: cancellationToken);

        return feature.ToDto();
    }

    public async Task DeleteAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var feature = await _featureRepository.GetByIdAsync(id, cancellationToken)
            ?? throw new AppException("feature_not_found", "Feature not found.", 404);

        if (feature.IsSystem)
        {
            throw new AppException("feature_protected", "System features cannot be deleted. Set IsActive=false to disable.", 400);
        }

        var inUse = await _planFeatureRepository.Query().AnyAsync(pf => pf.FeatureId == id, cancellationToken);
        if (inUse)
        {
            throw new AppException("feature_in_use", "Cannot delete a feature that is assigned to a subscription plan. Remove the assignments first.", 409);
        }

        _featureRepository.Remove(feature);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(
            entityName: nameof(Feature),
            entityId: feature.Id,
            actionType: "FeatureDeleted",
            newValue: $"key={feature.Key}",
            cancellationToken: cancellationToken);
    }

    private static void ValidateRequest(UpsertFeatureRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Key)) throw new AppException("validation_failed", "Feature key is required.", 400);
        if (string.IsNullOrWhiteSpace(request.Name)) throw new AppException("validation_failed", "Feature name is required.", 400);
        if (request.DisplayOrder < 0) throw new AppException("validation_failed", "DisplayOrder cannot be negative.", 400);
    }
}
