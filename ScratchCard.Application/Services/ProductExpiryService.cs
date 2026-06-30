using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Products;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Entities;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.Services;

/// <summary>Add-any-time product capture, status listing, save actions, and the binned-vs-saved KPI.</summary>
public sealed class ProductExpiryService : IProductExpiryService
{
    private static readonly string[] StaffRoles = [RoleNames.CompanyOwner, RoleNames.Manager, RoleNames.Cashier, RoleNames.SalesAssistant];
    private static readonly string[] ManageRoles = [RoleNames.CompanyOwner, RoleNames.Manager];

    private readonly IRepository<ProductBatch> _batches;
    private readonly IRepository<ProductExpiryAction> _actions;
    private readonly IRepository<ProductCategory> _categories;
    private readonly IShopMembershipService _shopMembership;
    private readonly IFeatureGateService _featureGate;
    private readonly ICurrentUserService _currentUser;
    private readonly IBarcodeProductLookup _barcodeLookup;
    private readonly IUnitOfWork _unitOfWork;

    public ProductExpiryService(
        IRepository<ProductBatch> batches,
        IRepository<ProductExpiryAction> actions,
        IRepository<ProductCategory> categories,
        IShopMembershipService shopMembership,
        IFeatureGateService featureGate,
        ICurrentUserService currentUser,
        IBarcodeProductLookup barcodeLookup,
        IUnitOfWork unitOfWork)
    {
        _batches = batches;
        _actions = actions;
        _categories = categories;
        _shopMembership = shopMembership;
        _featureGate = featureGate;
        _currentUser = currentUser;
        _barcodeLookup = barcodeLookup;
        _unitOfWork = unitOfWork;
    }

    private static DateOnly Today => DateOnly.FromDateTime(DateTime.UtcNow);

    /// <summary>Canonical barcode form (server is the source of truth): pad a numeric 12-14 digit code
    /// (EAN-13 / UPC / GTIN) to GTIN-14 so add and lookup share one key regardless of which client or
    /// entry path produced it. Non-numeric codes (e.g. code128 alphanumerics) are trimmed unchanged.
    /// Mirrors the mobile <c>normalizeGtin</c>. Returns null when empty.</summary>
    private static string? NormalizeBarcode(string? raw)
    {
        var code = raw?.Trim();
        if (string.IsNullOrEmpty(code)) return null;
        return code.Length is >= 12 and <= 14 && code.All(char.IsAsciiDigit) ? code.PadLeft(14, '0') : code;
    }

    private async Task EnsureAccessAsync(Guid shopId, CancellationToken ct)
    {
        await _shopMembership.EnsureCurrentUserShopRoleAsync(shopId, StaffRoles, ct);
        await _featureGate.EnsureFeatureAsync(shopId, FeatureKeys.ProductExpiryBasic, ct);
    }

    /// <summary>category id → its reminder stage days, for status derivation.</summary>
    private async Task<Dictionary<Guid, List<int>>> LoadRulesAsync(Guid shopId, CancellationToken ct)
    {
        var cats = await _categories.Query().AsNoTracking()
            .Include(c => c.ReminderRules)
            .Where(c => !c.IsDeleted && (c.ShopId == null || c.ShopId == shopId))
            .ToListAsync(ct);
        return cats.ToDictionary(c => c.Id, c => c.ReminderRules.Select(r => r.DaysBeforeExpiry).ToList());
    }

    public async Task<ProductBatchDto> AddAsync(AddProductRequest request, CancellationToken cancellationToken = default)
    {
        await EnsureAccessAsync(request.ShopId, cancellationToken);

        // Collapse internal whitespace (a multi-line OCR name can arrive as "Cadbury Dairy\n Milk")
        // and bound length to the column cap so an over-long combined name is a clean 400, not a
        // 500/silent truncation.
        var name = string.Join(' ', (request.ProductName ?? string.Empty).Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
        if (name.Length == 0) throw new AppException("validation_failed", "Product name is required.", 400);
        if (name.Length > 200) throw new AppException("validation_failed", "Product name is too long (max 200 characters).", 400);
        if (request.Quantity <= 0) throw new AppException("validation_failed", "Quantity must be greater than zero.", 400);
        if (request.UnitCost is < 0 || request.UnitPrice is < 0)
            throw new AppException("validation_failed", "Unit cost / price can't be negative.", 400);
        if (!Enum.IsDefined(request.DateType))
            throw new AppException("validation_failed", "Invalid date type.", 400);

        // Sanity-bound the expiry date. A mis-typed or mis-OCR'd year (e.g. "07" -> 2007, or "2207")
        // would otherwise persist and silently mis-grade status / pollute the waste report. The lower
        // bound still allows logging recently-expired clearance stock.
        var today = Today;
        if (request.ExpiryDate < today.AddYears(-1) || request.ExpiryDate > today.AddYears(10))
            throw new AppException("validation_failed", "Expiry date looks wrong — pick a date within the last year or the next 10 years.", 400);

        var batchNumber = string.IsNullOrWhiteSpace(request.BatchNumber) ? null : request.BatchNumber.Trim();
        if (batchNumber is { Length: > 100 })
            throw new AppException("validation_failed", "Batch number is too long (max 100 characters).", 400);

        var category = await _categories.Query().AsNoTracking()
            .FirstOrDefaultAsync(c => c.Id == request.ProductCategoryId && !c.IsDeleted
                && (c.ShopId == null || c.ShopId == request.ShopId), cancellationToken)
            ?? throw new AppException("category_not_found", "Pick a valid product category.", 400);

        var now = DateTimeOffset.UtcNow;
        var batch = new ProductBatch
        {
            ShopId = request.ShopId,
            ProductCategoryId = category.Id,
            ProductName = name,
            Barcode = NormalizeBarcode(request.Barcode),
            Quantity = request.Quantity,
            RemainingQuantity = request.Quantity,
            ExpiryDate = request.ExpiryDate,
            DateType = request.DateType,
            BatchNumber = batchNumber,
            UnitCost = request.UnitCost,
            UnitPrice = request.UnitPrice,
            AddedByUserId = _currentUser.UserId ?? Guid.Empty,
            AddedOn = now,
            CreatedOn = now,
        };
        await _batches.AddAsync(batch, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        var rules = category.ReminderRules?.Select(r => r.DaysBeforeExpiry).ToList() ?? await RuleDaysForCategoryAsync(category.Id, cancellationToken);
        return Map(batch, category.Name, rules);
    }

    public async Task<ProductBarcodeLookupDto> LookupByBarcodeAsync(Guid shopId, string barcode, CancellationToken cancellationToken = default)
    {
        await EnsureAccessAsync(shopId, cancellationToken);
        var code = NormalizeBarcode(barcode);
        if (code is null) return new ProductBarcodeLookupDto { Found = false, Source = "none", Barcode = string.Empty };

        // 1) Most recent batch with this barcode at this shop → seeds the next add for the product.
        var last = await _batches.Query().AsNoTracking()
            .Where(b => b.ShopId == shopId && !b.IsDeleted && b.Barcode == code)
            .OrderByDescending(b => b.AddedOn)
            .FirstOrDefaultAsync(cancellationToken);

        if (last is not null)
        {
            var categoryName = await _categories.Query().AsNoTracking()
                .Where(c => c.Id == last.ProductCategoryId).Select(c => c.Name).FirstOrDefaultAsync(cancellationToken);
            return new ProductBarcodeLookupDto
            {
                Found = true,
                Source = "local",
                Barcode = code,
                ProductName = last.ProductName,
                ProductCategoryId = last.ProductCategoryId,
                CategoryName = categoryName,
                DateType = last.DateType,
                UnitCost = last.UnitCost,
                UnitPrice = last.UnitPrice,
            };
        }

        // 2) Not seen here before — try the external product database for a name (best-effort).
        var online = await _barcodeLookup.LookupAsync(code, cancellationToken);
        if (online is not null)
        {
            // Resolve the suggested category name to one this shop actually has (prefer a custom
            // category over the built-in when both share the name).
            Guid? catId = null;
            string? catName = null;
            if (!string.IsNullOrWhiteSpace(online.CategoryHint))
            {
                var cat = await _categories.Query().AsNoTracking()
                    .Where(c => !c.IsDeleted && c.IsActive && (c.ShopId == null || c.ShopId == shopId) && c.Name == online.CategoryHint)
                    .OrderBy(c => c.ShopId == null ? 1 : 0)
                    .FirstOrDefaultAsync(cancellationToken);
                if (cat is not null) { catId = cat.Id; catName = cat.Name; }
            }

            return new ProductBarcodeLookupDto
            {
                Found = true,
                Source = "online",
                Barcode = code,
                // ProductName already folds in the brand — don't also expose it separately (one source of truth).
                ProductName = string.IsNullOrWhiteSpace(online.Brand) ? online.Name : $"{online.Brand} {online.Name}",
                ProductCategoryId = catId,
                CategoryName = catName,
            };
        }

        return new ProductBarcodeLookupDto { Found = false, Source = "none", Barcode = code };
    }

    public async Task<IReadOnlyCollection<ProductBatchDto>> ListAsync(Guid shopId, ProductExpiryStatus? status, CancellationToken cancellationToken = default)
    {
        await EnsureAccessAsync(shopId, cancellationToken);

        var rulesByCat = await LoadRulesAsync(shopId, cancellationToken);
        var catNames = await _categories.Query().AsNoTracking()
            .Where(c => !c.IsDeleted && (c.ShopId == null || c.ShopId == shopId))
            .ToDictionaryAsync(c => c.Id, c => c.Name, cancellationToken);

        var batches = await _batches.Query().AsNoTracking()
            .Include(b => b.Actions)
            .Where(b => b.ShopId == shopId && !b.IsDeleted && b.RemainingQuantity > 0)
            .OrderBy(b => b.ExpiryDate)
            .ToListAsync(cancellationToken);

        var today = Today;
        var mapped = batches.Select(b => Map(b, catNames.GetValueOrDefault(b.ProductCategoryId, ""), rulesByCat.GetValueOrDefault(b.ProductCategoryId, []), today));
        if (status is { } s) mapped = mapped.Where(d => d.Status == s.ToString());
        return mapped.ToList();
    }

    public async Task<ProductBatchDto> GetAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var batch = await _batches.Query().AsNoTracking()
            .Include(b => b.Actions)
            .FirstOrDefaultAsync(b => b.Id == id && !b.IsDeleted, cancellationToken)
            ?? throw new AppException("product_not_found", "Product not found.", 404);

        await EnsureAccessAsync(batch.ShopId, cancellationToken);
        var rules = await RuleDaysForCategoryAsync(batch.ProductCategoryId, cancellationToken);
        var catName = await _categories.Query().AsNoTracking()
            .Where(c => c.Id == batch.ProductCategoryId).Select(c => c.Name).FirstOrDefaultAsync(cancellationToken) ?? "";
        return Map(batch, catName, rules);
    }

    public async Task<ProductBatchDto> RecordActionAsync(RecordProductActionRequest request, CancellationToken cancellationToken = default)
    {
        var batch = await _batches.Query()
            .Include(b => b.Actions)
            .FirstOrDefaultAsync(b => b.Id == request.ProductBatchId && !b.IsDeleted, cancellationToken)
            ?? throw new AppException("product_not_found", "Product not found.", 404);

        await EnsureAccessAsync(batch.ShopId, cancellationToken);
        if (!Enum.IsDefined(request.ActionType)) throw new AppException("validation_failed", "Invalid action type.", 400);
        if (request.Quantity <= 0) throw new AppException("validation_failed", "Action quantity must be greater than zero.", 400);

        // Food-safety hard stop: a past use-by item may ONLY be disposed or returned — never sold,
        // discounted, donated, or moved back to the shelf. Enforced server-side (the UI mirrors it).
        var expired = ProductExpiryMath.DaysToExpiry(batch.ExpiryDate, Today) < 0;
        if (batch.DateType == ProductDateType.UseBy && expired
            && request.ActionType is not (ProductExpiryActionType.Dispose or ProductExpiryActionType.ReturnToSupplier))
        {
            throw new AppException("use_by_expired", "Past use-by — this item can only be disposed or returned to the supplier.", 400);
        }

        var qty = request.Quantity;
        if (ProductExpiryMath.ReducesStock(request.ActionType))
        {
            if (qty > batch.RemainingQuantity)
                throw new AppException("validation_failed", $"Only {batch.RemainingQuantity} unit(s) remain.", 400);
            batch.RemainingQuantity -= qty;
        }

        var now = DateTimeOffset.UtcNow;
        var action = new ProductExpiryAction
        {
            ProductBatchId = batch.Id,
            ActionType = request.ActionType,
            Quantity = qty,
            Comment = string.IsNullOrWhiteSpace(request.Comment) ? null : request.Comment.Trim(),
            PerformedByUserId = _currentUser.UserId ?? Guid.Empty,
            PerformedOn = now,
            CreatedOn = now,
        };
        await _actions.AddAsync(action, cancellationToken);
        batch.ModifiedOn = now;
        _batches.Update(batch);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return await GetAsync(batch.Id, cancellationToken);
    }

    public async Task<IReadOnlyCollection<ProductActionHistoryDto>> GetActionHistoryAsync(Guid shopId, DateOnly from, DateOnly to, CancellationToken cancellationToken = default)
    {
        // Same access as List (operational + product_expiry.basic): the history is "the list, without the
        // remaining>0 filter, flattened to actions" — nothing more sensitive than a batch's own action log.
        await EnsureAccessAsync(shopId, cancellationToken);
        if (to < from) throw new AppException("validation_failed", "To date must be on or after from date.", 400);

        var start = new DateTimeOffset(from.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        var end = new DateTimeOffset(to.AddDays(1).ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);

        var catNames = await _categories.Query().AsNoTracking()
            .Where(c => !c.IsDeleted && (c.ShopId == null || c.ShopId == shopId))
            .ToDictionaryAsync(c => c.Id, c => c.Name, cancellationToken);

        // Join actions to their batch (ignores RemainingQuantity, so fully-cleared batches are included).
        var rows = await (from a in _actions.Query().AsNoTracking()
                          join b in _batches.Query().AsNoTracking() on a.ProductBatchId equals b.Id
                          where b.ShopId == shopId && !b.IsDeleted && a.PerformedOn >= start && a.PerformedOn < end
                          orderby a.PerformedOn descending
                          select new
                          {
                              a.Id,
                              a.ProductBatchId,
                              a.ActionType,
                              a.Quantity,
                              a.Comment,
                              a.PerformedByUserId,
                              a.PerformedOn,
                              b.ProductName,
                              b.ProductCategoryId,
                              b.Barcode,
                              b.ExpiryDate,
                              b.DateType,
                              b.UnitCost,
                              b.UnitPrice,
                          }).ToListAsync(cancellationToken);

        return rows.Select(r =>
        {
            var isSave = ProductExpiryMath.IsSaveAction(r.ActionType);
            var value = isSave
                ? ProductExpiryMath.SavedValue(r.Quantity, r.UnitPrice)
                : ProductExpiryMath.EstimatedLoss(r.Quantity, r.UnitCost);
            return new ProductActionHistoryDto
            {
                Id = r.Id,
                ProductBatchId = r.ProductBatchId,
                ProductName = r.ProductName,
                ProductCategoryId = r.ProductCategoryId,
                CategoryName = catNames.GetValueOrDefault(r.ProductCategoryId, ""),
                Barcode = r.Barcode,
                ActionType = r.ActionType.ToString(),
                Quantity = r.Quantity,
                Comment = r.Comment,
                IsSave = isSave,
                ReducesStock = ProductExpiryMath.ReducesStock(r.ActionType),
                Value = value,
                ExpiryDate = r.ExpiryDate,
                DateType = r.DateType,
                PerformedByUserId = r.PerformedByUserId,
                PerformedOn = r.PerformedOn,
            };
        }).ToList();
    }

    public async Task<ProductExpiryScoreboardDto> GetScoreboardAsync(Guid shopId, DateOnly from, DateOnly to, CancellationToken cancellationToken = default)
    {
        await _shopMembership.EnsureCurrentUserShopRoleAsync(shopId, ManageRoles, cancellationToken);
        await _featureGate.EnsureFeatureAsync(shopId, FeatureKeys.ProductExpiryReports, cancellationToken);
        if (to < from) throw new AppException("validation_failed", "To date must be on or after from date.", 400);

        var start = new DateTimeOffset(from.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        var end = new DateTimeOffset(to.AddDays(1).ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);

        var rows = await (from a in _actions.Query().AsNoTracking()
                          join b in _batches.Query().AsNoTracking() on a.ProductBatchId equals b.Id
                          where b.ShopId == shopId && !b.IsDeleted && a.PerformedOn >= start && a.PerformedOn < end
                          select new { a.ActionType, a.Quantity, b.UnitCost, b.UnitPrice })
                         .ToListAsync(cancellationToken);

        // Only final dispositions (stock-reducing) count toward binned-vs-saved.
        var dispositions = rows.Where(r => ProductExpiryMath.ReducesStock(r.ActionType)).ToList();

        var byType = dispositions
            .GroupBy(r => r.ActionType)
            .Select(g =>
            {
                var save = ProductExpiryMath.IsSaveAction(g.Key);
                var units = g.Sum(x => x.Quantity);
                var value = save
                    ? g.Sum(x => ProductExpiryMath.SavedValue(x.Quantity, x.UnitPrice))
                    : g.Sum(x => ProductExpiryMath.EstimatedLoss(x.Quantity, x.UnitCost));
                return new ProductExpiryDispositionDto { ActionType = g.Key.ToString(), Units = units, Value = value, IsSave = save };
            })
            .OrderByDescending(d => d.Units)
            .ToList();

        var savedUnits = byType.Where(d => d.IsSave).Sum(d => d.Units);
        var binnedUnits = byType.Where(d => !d.IsSave).Sum(d => d.Units);

        return new ProductExpiryScoreboardDto
        {
            From = from,
            To = to,
            SavedUnits = savedUnits,
            SavedValue = byType.Where(d => d.IsSave).Sum(d => d.Value),
            BinnedUnits = binnedUnits,
            BinnedValue = byType.Where(d => !d.IsSave).Sum(d => d.Value),
            SaveRate = ProductExpiryMath.SaveRate(savedUnits, binnedUnits),
            ByDisposition = byType,
        };
    }

    private async Task<List<int>> RuleDaysForCategoryAsync(Guid categoryId, CancellationToken ct)
        => await _categories.Query().AsNoTracking()
            .Where(c => c.Id == categoryId)
            .SelectMany(c => c.ReminderRules.Select(r => r.DaysBeforeExpiry))
            .ToListAsync(ct);

    private static ProductBatchDto Map(ProductBatch b, string categoryName, IReadOnlyList<int> ruleDays, DateOnly? today = null)
    {
        var d = today ?? Today;
        return new ProductBatchDto
        {
            Id = b.Id,
            ShopId = b.ShopId,
            ProductCategoryId = b.ProductCategoryId,
            CategoryName = categoryName,
            ProductName = b.ProductName,
            Barcode = b.Barcode,
            Quantity = b.Quantity,
            RemainingQuantity = b.RemainingQuantity,
            ExpiryDate = b.ExpiryDate,
            DateType = b.DateType,
            BatchNumber = b.BatchNumber,
            UnitCost = b.UnitCost,
            UnitPrice = b.UnitPrice,
            Status = ProductExpiryMath.StatusOf(b.ExpiryDate, d, ruleDays).ToString(),
            DaysToExpiry = ProductExpiryMath.DaysToExpiry(b.ExpiryDate, d),
            AddedByUserId = b.AddedByUserId,
            AddedOn = b.AddedOn,
            Actions = (b.Actions ?? new List<ProductExpiryAction>())
                .OrderByDescending(a => a.PerformedOn)
                .Select(a => new ProductExpiryActionDto
                {
                    Id = a.Id,
                    ProductBatchId = a.ProductBatchId,
                    ActionType = a.ActionType.ToString(),
                    Quantity = a.Quantity,
                    Comment = a.Comment,
                    PerformedByUserId = a.PerformedByUserId,
                    PerformedOn = a.PerformedOn,
                }).ToList(),
        };
    }
}
