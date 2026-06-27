using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Products;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Entities;

namespace ScratchCard.Application.Services;

/// <summary>Per-shop custom product categories + reminder rules, layered over the global built-ins.</summary>
public sealed class ProductCategoryService : IProductCategoryService
{
    private static readonly string[] StaffRoles = [RoleNames.CompanyOwner, RoleNames.Manager, RoleNames.Cashier, RoleNames.SalesAssistant];
    private static readonly string[] ManageRoles = [RoleNames.CompanyOwner, RoleNames.Manager];

    private readonly IRepository<ProductCategory> _categories;
    private readonly IRepository<ProductExpiryReminderRule> _rules;
    private readonly IRepository<ProductBatch> _batches;
    private readonly IShopMembershipService _shopMembership;
    private readonly IFeatureGateService _featureGate;
    private readonly IUnitOfWork _unitOfWork;

    public ProductCategoryService(
        IRepository<ProductCategory> categories,
        IRepository<ProductExpiryReminderRule> rules,
        IRepository<ProductBatch> batches,
        IShopMembershipService shopMembership,
        IFeatureGateService featureGate,
        IUnitOfWork unitOfWork)
    {
        _categories = categories;
        _rules = rules;
        _batches = batches;
        _shopMembership = shopMembership;
        _featureGate = featureGate;
        _unitOfWork = unitOfWork;
    }

    private async Task EnsureReadAsync(Guid shopId, CancellationToken ct)
    {
        await _shopMembership.EnsureCurrentUserShopRoleAsync(shopId, StaffRoles, ct);
        await _featureGate.EnsureFeatureAsync(shopId, FeatureKeys.ProductExpiryBasic, ct);
    }

    private async Task EnsureManageAsync(Guid shopId, CancellationToken ct)
    {
        await _shopMembership.EnsureCurrentUserShopRoleAsync(shopId, ManageRoles, ct);
        await _featureGate.EnsureFeatureAsync(shopId, FeatureKeys.ProductExpiryBasic, ct);
    }

    public async Task<IReadOnlyCollection<ProductCategoryDto>> ListAsync(Guid shopId, CancellationToken cancellationToken = default)
    {
        await EnsureReadAsync(shopId, cancellationToken);

        var rows = await _categories.Query().AsNoTracking()
            .Include(c => c.ReminderRules)
            .Where(c => !c.IsDeleted && (c.ShopId == null || c.ShopId == shopId) && c.IsActive)
            .ToListAsync(cancellationToken);

        return rows
            .Select(Map)
            .OrderBy(c => c.IsBuiltIn ? 0 : 1)
            .ThenBy(c => c.SortOrder)
            .ThenBy(c => c.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    public async Task<ProductCategoryDto> CreateAsync(CreateProductCategoryRequest request, CancellationToken cancellationToken = default)
    {
        await EnsureManageAsync(request.ShopId, cancellationToken);
        var name = (request.Name ?? string.Empty).Trim();
        if (name.Length == 0)
        {
            throw new AppException("validation_failed", "Category name is required.", 400);
        }

        // Reject a duplicate name BEFORE insert. This also covers a collision with a global built-in
        // (ShopId == null) that the (ShopId, Name, IsDeleted) unique index does NOT catch — without
        // this a shop could create its own "Dairy" alongside the built-in "Dairy". Now that staff can
        // create categories inline from the Add Product screen, these collisions are routine.
        await EnsureNameAvailableAsync(request.ShopId, name, null, cancellationToken);

        var now = DateTimeOffset.UtcNow;
        var category = new ProductCategory
        {
            ShopId = request.ShopId,
            Name = name,
            SortOrder = request.SortOrder ?? 100,
            IsActive = true,
            IsBuiltIn = false,
            CreatedOn = now,
            ReminderRules = NormalizeDays(request.ReminderDays)
                .Select(d => new ProductExpiryReminderRule { DaysBeforeExpiry = d, CreatedOn = now })
                .ToList(),
        };
        await _categories.AddAsync(category, cancellationToken);
        try
        {
            await _unitOfWork.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            // Lost a race against a concurrent create of the same shop-scoped name (unique index) —
            // surface the clean 409 instead of a raw 500.
            throw new AppException("category_duplicate_name", "A category with that name already exists.", 409);
        }
        return Map(category);
    }

    public async Task<ProductCategoryDto> UpdateAsync(UpdateProductCategoryRequest request, CancellationToken cancellationToken = default)
    {
        await EnsureManageAsync(request.ShopId, cancellationToken);

        var category = await _categories.Query()
            .Include(c => c.ReminderRules)
            .FirstOrDefaultAsync(c => c.Id == request.Id, cancellationToken)
            ?? throw new AppException("category_not_found", "Product category not found.", 404);

        if (category.IsBuiltIn || category.ShopId != request.ShopId)
        {
            throw new AppException("category_not_editable", "Built-in categories can't be edited.", 400);
        }

        var name = (request.Name ?? string.Empty).Trim();
        if (name.Length == 0)
        {
            throw new AppException("validation_failed", "Category name is required.", 400);
        }

        await EnsureNameAvailableAsync(request.ShopId, name, category.Id, cancellationToken);

        category.Name = name;
        category.SortOrder = request.SortOrder;
        category.IsActive = request.IsActive;
        category.ModifiedOn = DateTimeOffset.UtcNow;

        // Replace the reminder stages wholesale.
        foreach (var existing in category.ReminderRules.ToList())
        {
            _rules.Remove(existing);
        }
        category.ReminderRules.Clear();
        var now = DateTimeOffset.UtcNow;
        foreach (var d in NormalizeDays(request.ReminderDays))
        {
            category.ReminderRules.Add(new ProductExpiryReminderRule { ProductCategoryId = category.Id, DaysBeforeExpiry = d, CreatedOn = now });
        }

        _categories.Update(category);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return Map(category);
    }

    public async Task DeleteAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var category = await _categories.Query()
            .Include(c => c.ReminderRules)
            .FirstOrDefaultAsync(c => c.Id == id, cancellationToken)
            ?? throw new AppException("category_not_found", "Product category not found.", 404);

        // Built-in / global categories have no owning shop, are never deletable, and must not be
        // distinguishable from "not found" to a non-member (avoid a cross-shop existence oracle).
        if (category.IsBuiltIn || category.ShopId is null)
        {
            throw new AppException("category_not_found", "Product category not found.", 404);
        }

        // Authorize against the owning shop BEFORE disclosing anything further.
        await EnsureManageAsync(category.ShopId.Value, cancellationToken);

        // Block deletion while active stock still references the category (would strip its grading).
        var inUse = await _batches.Query().AsNoTracking()
            .AnyAsync(b => b.ProductCategoryId == id && !b.IsDeleted && b.RemainingQuantity > 0, cancellationToken);
        if (inUse)
        {
            throw new AppException("category_in_use", "This category still has active stock. Clear or recategorise it first.", 409);
        }

        // Cascade only fires on a hard delete — remove the reminder rules explicitly on soft delete.
        foreach (var rule in category.ReminderRules.ToList())
        {
            _rules.Remove(rule);
        }
        category.ReminderRules.Clear();
        category.IsDeleted = true;
        category.ModifiedOn = DateTimeOffset.UtcNow;
        _categories.Update(category);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
    }

    /// <summary>Throws a 409 if an active, non-deleted category with this name already exists for the
    /// shop or among the global built-ins. <paramref name="excludeId"/> skips the row being updated.
    /// SQL Server's default collation is case-insensitive, so "Dairy" and "dairy" collide.</summary>
    private async Task EnsureNameAvailableAsync(Guid shopId, string name, Guid? excludeId, CancellationToken ct)
    {
        var clash = await _categories.Query().AsNoTracking()
            .AnyAsync(c => !c.IsDeleted && c.IsActive
                && (c.ShopId == null || c.ShopId == shopId)
                && (excludeId == null || c.Id != excludeId)
                && c.Name == name, ct);
        if (clash)
        {
            throw new AppException("category_duplicate_name", "A category with that name already exists.", 409);
        }
    }

    private static IReadOnlyList<int> NormalizeDays(IReadOnlyList<int>? days)
        => (days ?? [])
            .Where(d => d >= 0)
            .Distinct()
            .OrderByDescending(d => d)
            .ToList();

    private static ProductCategoryDto Map(ProductCategory c) => new()
    {
        Id = c.Id,
        ShopId = c.ShopId,
        Name = c.Name,
        SortOrder = c.SortOrder,
        IsActive = c.IsActive,
        IsBuiltIn = c.IsBuiltIn,
        ReminderDays = c.ReminderRules.Select(r => r.DaysBeforeExpiry).OrderByDescending(d => d).ToList(),
    };
}
