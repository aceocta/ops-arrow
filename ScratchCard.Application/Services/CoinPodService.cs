using System.Text;
using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Models;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.CoinPods;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Entities;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.Services;

/// <summary>
/// Coin Pod: per-shop coin bag stock. Lazily seeds each shop's config + stock from the catalogue,
/// records every movement as a <see cref="CoinBagTransaction"/>, recalculates stock, and raises /
/// resolves low- and out-of-stock alerts (with push notification to owners/managers) after each one.
/// </summary>
public sealed class CoinPodService : ICoinPodService
{
    private static readonly string[] StaffRoles = [RoleNames.CompanyOwner, RoleNames.Manager, RoleNames.Cashier, RoleNames.SalesAssistant];
    private static readonly string[] ManageRoles = [RoleNames.CompanyOwner, RoleNames.Manager];

    private readonly IRepository<CoinDenomination> _denominations;
    private readonly IRepository<ShopCoinBagConfig> _configs;
    private readonly IRepository<ShopCoinBagStock> _stocks;
    private readonly IRepository<CoinBagTransaction> _transactions;
    private readonly IRepository<CoinBagAlert> _alerts;
    private readonly IRepository<ShopUser> _shopUsers;
    private readonly IRepository<UserPushToken> _pushTokens;
    private readonly IRepository<Shop> _shops;
    private readonly IShopMembershipService _shopMembership;
    private readonly IFeatureGateService _featureGate;
    private readonly ICurrentUserService _currentUser;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IAuditService _auditService;
    private readonly INotificationService _notificationService;

    public CoinPodService(
        IRepository<CoinDenomination> denominations,
        IRepository<ShopCoinBagConfig> configs,
        IRepository<ShopCoinBagStock> stocks,
        IRepository<CoinBagTransaction> transactions,
        IRepository<CoinBagAlert> alerts,
        IRepository<ShopUser> shopUsers,
        IRepository<UserPushToken> pushTokens,
        IRepository<Shop> shops,
        IShopMembershipService shopMembership,
        IFeatureGateService featureGate,
        ICurrentUserService currentUser,
        IUnitOfWork unitOfWork,
        IAuditService auditService,
        INotificationService notificationService)
    {
        _denominations = denominations;
        _configs = configs;
        _stocks = stocks;
        _transactions = transactions;
        _alerts = alerts;
        _shopUsers = shopUsers;
        _pushTokens = pushTokens;
        _shops = shops;
        _shopMembership = shopMembership;
        _featureGate = featureGate;
        _currentUser = currentUser;
        _unitOfWork = unitOfWork;
        _auditService = auditService;
        _notificationService = notificationService;
    }

    // -------------------------------------------------------------------
    // Access
    // -------------------------------------------------------------------
    private async Task EnsureAccessAsync(Guid shopId, CancellationToken ct)
    {
        await _shopMembership.EnsureCurrentUserShopRoleAsync(shopId, StaffRoles, ct);
        await _featureGate.EnsureFeatureAsync(shopId, FeatureKeys.CoinPodBasic, ct);
    }

    private async Task EnsureManageAsync(Guid shopId, CancellationToken ct)
    {
        await _shopMembership.EnsureCurrentUserShopRoleAsync(shopId, ManageRoles, ct);
        await _featureGate.EnsureFeatureAsync(shopId, FeatureKeys.CoinPodBasic, ct);
    }

    // -------------------------------------------------------------------
    // Lazy per-shop setup
    // -------------------------------------------------------------------

    /// <summary>Ensures a config + stock row (and an OpeningBalance transaction) exists for every active
    /// denomination at this shop. Idempotent — only creates rows that are missing.</summary>
    private async Task EnsureShopSetupAsync(Guid shopId, CancellationToken ct)
    {
        var denominations = await _denominations.Query().AsNoTracking()
            .Where(d => d.IsActive)
            .ToListAsync(ct);

        var existingConfigDenomIds = await _configs.Query().AsNoTracking()
            .Where(c => c.ShopId == shopId && !c.IsDeleted)
            .Select(c => c.CoinDenominationId)
            .ToListAsync(ct);
        var have = existingConfigDenomIds.ToHashSet();

        var missing = denominations.Where(d => !have.Contains(d.Id)).ToList();
        if (missing.Count == 0) return;

        var defaultsByCode = CoinDenominationCatalogue.Defaults.ToDictionary(d => d.Code, StringComparer.OrdinalIgnoreCase);
        var now = DateTimeOffset.UtcNow;
        var userId = _currentUser.UserId ?? Guid.Empty;

        foreach (var denom in missing)
        {
            var def = defaultsByCode.GetValueOrDefault(denom.Code);
            var bagValue = def?.DefaultBagValue ?? denom.CoinValue;
            var openingQty = def?.DefaultOpeningBagQuantity ?? 0;

            var config = new ShopCoinBagConfig
            {
                ShopId = shopId,
                CoinDenominationId = denom.Id,
                BagValue = bagValue,
                MinBagQuantity = def?.DefaultMinBagQuantity ?? 0,
                MaxBagQuantity = def?.DefaultMaxBagQuantity ?? 0,
                OpeningBagQuantity = openingQty,
                StockAlertLimit = def?.DefaultStockAlertLimit ?? 0,
                IsAlertEnabled = true,
                AlertRecipientType = CoinBagAlertRecipientType.OwnersAndManagers,
                AlertChannel = NotificationChannel.InApp,
                IsActive = true,
                CreatedOn = now,
                CreatedBy = userId,
            };
            await _configs.AddAsync(config, ct);

            var stock = new ShopCoinBagStock
            {
                ShopId = shopId,
                CoinDenominationId = denom.Id,
                CurrentBagQuantity = openingQty,
                CurrentTotalValue = openingQty * bagValue,
                LastUpdatedOn = now,
                LastUpdatedByUserId = userId,
                CreatedOn = now,
                CreatedBy = userId,
            };
            await _stocks.AddAsync(stock, ct);

            if (openingQty > 0)
            {
                await _transactions.AddAsync(new CoinBagTransaction
                {
                    ShopId = shopId,
                    TransactionNumber = NextTransactionNumber(now),
                    TransactionType = CoinBagTransactionType.OpeningBalance,
                    CoinDenominationId = denom.Id,
                    BagQuantity = openingQty,
                    BagValue = bagValue,
                    TotalCoinValue = openingQty * bagValue,
                    NoteAmount = 0,
                    DifferenceAmount = 0,
                    Direction = CoinBagTransactionDirection.In,
                    Status = CoinBagTransactionStatus.Active,
                    Comment = "Opening balance",
                    PerformedByUserId = userId,
                    PerformedOn = now,
                    CreatedOn = now,
                    CreatedBy = userId,
                }, ct);
            }
        }

        await _unitOfWork.SaveChangesAsync(ct);
    }

    // -------------------------------------------------------------------
    // Dashboard / config (reads)
    // -------------------------------------------------------------------
    public async Task<CoinPodDashboardDto> GetDashboardAsync(Guid shopId, CancellationToken cancellationToken = default)
    {
        await EnsureAccessAsync(shopId, cancellationToken);
        await EnsureShopSetupAsync(shopId, cancellationToken);

        var rows = await BuildStockRowsAsync(shopId, cancellationToken);
        var activeAlerts = await _alerts.Query().AsNoTracking()
            .CountAsync(a => a.ShopId == shopId && a.Status == CoinBagAlertStatus.Active, cancellationToken);

        return new CoinPodDashboardDto
        {
            ShopId = shopId,
            TotalCoinValue = rows.Where(r => r.IsActive).Sum(r => r.CurrentTotalValue),
            ActiveAlertCount = activeAlerts,
            Items = rows,
        };
    }

    private async Task<List<CoinBagStockRowDto>> BuildStockRowsAsync(Guid shopId, CancellationToken ct)
    {
        var denoms = await _denominations.Query().AsNoTracking().ToDictionaryAsync(d => d.Id, ct);
        var configs = await _configs.Query().AsNoTracking()
            .Where(c => c.ShopId == shopId && !c.IsDeleted).ToListAsync(ct);
        var stocks = await _stocks.Query().AsNoTracking()
            .Where(s => s.ShopId == shopId && !s.IsDeleted)
            .ToDictionaryAsync(s => s.CoinDenominationId, ct);

        var rows = new List<CoinBagStockRowDto>();
        foreach (var config in configs)
        {
            if (!denoms.TryGetValue(config.CoinDenominationId, out var denom)) continue;
            var stock = stocks.GetValueOrDefault(config.CoinDenominationId);
            var qty = stock?.CurrentBagQuantity ?? 0;
            rows.Add(new CoinBagStockRowDto
            {
                CoinDenominationId = denom.Id,
                Code = denom.Code,
                DisplayLabel = denom.DisplayLabel,
                Name = denom.Name,
                SortOrder = denom.SortOrder,
                BagValue = config.BagValue,
                CurrentBagQuantity = qty,
                CurrentTotalValue = stock?.CurrentTotalValue ?? 0,
                StockAlertLimit = config.StockAlertLimit,
                IsAlertEnabled = config.IsAlertEnabled,
                IsActive = config.IsActive,
                Status = DeriveStatus(config, qty),
                LastUpdatedOn = stock?.LastUpdatedOn,
                LastUpdatedByUserId = stock?.LastUpdatedByUserId,
            });
        }
        return rows.OrderBy(r => r.SortOrder).ToList();
    }

    public async Task<IReadOnlyCollection<CoinBagConfigDto>> GetConfigAsync(Guid shopId, CancellationToken cancellationToken = default)
    {
        await EnsureManageAsync(shopId, cancellationToken);
        await EnsureShopSetupAsync(shopId, cancellationToken);

        var denoms = await _denominations.Query().AsNoTracking().ToDictionaryAsync(d => d.Id, cancellationToken);
        var stocks = await _stocks.Query().AsNoTracking()
            .Where(s => s.ShopId == shopId && !s.IsDeleted)
            .ToDictionaryAsync(s => s.CoinDenominationId, cancellationToken);
        var configs = await _configs.Query().AsNoTracking()
            .Where(c => c.ShopId == shopId && !c.IsDeleted).ToListAsync(cancellationToken);

        return configs
            .Where(c => denoms.ContainsKey(c.CoinDenominationId))
            .Select(c => MapConfig(c, denoms[c.CoinDenominationId], stocks.GetValueOrDefault(c.CoinDenominationId)?.CurrentBagQuantity ?? 0))
            .OrderBy(c => c.SortOrder)
            .ToList();
    }

    public async Task<CoinBagConfigDto> UpdateConfigAsync(UpdateCoinBagConfigRequest request, CancellationToken cancellationToken = default)
    {
        await EnsureManageAsync(request.ShopId, cancellationToken);

        if (request.BagValue <= 0) throw new AppException("validation_failed", "Bag value must be greater than zero.", 400);
        if (request.StockAlertLimit < 0) throw new AppException("validation_failed", "Stock alert limit cannot be below zero.", 400);
        if (request.OpeningBagQuantity < 0 || request.MinBagQuantity < 0 || request.MaxBagQuantity < 0)
            throw new AppException("validation_failed", "Quantities cannot be negative.", 400);

        var config = await _configs.Query()
            .FirstOrDefaultAsync(c => c.ShopId == request.ShopId && c.CoinDenominationId == request.CoinDenominationId && !c.IsDeleted, cancellationToken)
            ?? throw new AppException("coin_config_not_found", "Coin bag configuration not found.", 404);

        var denom = await _denominations.Query().AsNoTracking()
            .FirstOrDefaultAsync(d => d.Id == request.CoinDenominationId, cancellationToken)
            ?? throw new AppException("coin_denomination_not_found", "Coin denomination not found.", 404);

        var now = DateTimeOffset.UtcNow;
        config.BagValue = request.BagValue;
        config.MinBagQuantity = request.MinBagQuantity;
        config.MaxBagQuantity = request.MaxBagQuantity;
        config.OpeningBagQuantity = request.OpeningBagQuantity;
        config.StockAlertLimit = request.StockAlertLimit;
        config.IsAlertEnabled = request.IsAlertEnabled;
        config.AlertRecipientType = ParseRecipientType(request.AlertRecipientType);
        config.IsActive = request.IsActive;
        config.ModifiedOn = now;
        config.ModifiedBy = _currentUser.UserId;
        _configs.Update(config);

        // Bag value may have changed → keep the denormalised stock total in sync.
        var stock = await _stocks.Query()
            .FirstOrDefaultAsync(s => s.ShopId == request.ShopId && s.CoinDenominationId == request.CoinDenominationId && !s.IsDeleted, cancellationToken);
        if (stock is not null)
        {
            stock.CurrentTotalValue = stock.CurrentBagQuantity * config.BagValue;
            stock.ModifiedOn = now;
            stock.ModifiedBy = _currentUser.UserId;
            _stocks.Update(stock);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        await _auditService.LogAsync(nameof(ShopCoinBagConfig), config.Id, "CoinConfigUpdated", request.ShopId, cancellationToken: cancellationToken);

        return MapConfig(config, denom, stock?.CurrentBagQuantity ?? 0);
    }

    // -------------------------------------------------------------------
    // Movements
    // -------------------------------------------------------------------
    public Task<CoinBagTransactionDto> SwapNotesToCoinsAsync(CoinSwapRequest request, CancellationToken cancellationToken = default)
        => RecordSwapAsync(request, CoinBagTransactionType.NotesToCoins, cancellationToken);

    public Task<CoinBagTransactionDto> SwapCoinsToNotesAsync(CoinSwapRequest request, CancellationToken cancellationToken = default)
        => RecordSwapAsync(request, CoinBagTransactionType.CoinsToNotes, cancellationToken);

    private async Task<CoinBagTransactionDto> RecordSwapAsync(CoinSwapRequest request, CoinBagTransactionType type, CancellationToken ct)
    {
        await EnsureAccessAsync(request.ShopId, ct);
        await EnsureShopSetupAsync(request.ShopId, ct);
        if (request.BagQuantity <= 0) throw new AppException("validation_failed", "Bag quantity must be greater than zero.", 400);
        if (request.NoteAmount < 0) throw new AppException("validation_failed", "Note amount cannot be negative.", 400);

        var isNotesToCoins = type == CoinBagTransactionType.NotesToCoins;
        var signedDelta = isNotesToCoins ? -request.BagQuantity : request.BagQuantity;
        var direction = isNotesToCoins ? CoinBagTransactionDirection.Out : CoinBagTransactionDirection.In;

        // A swap where notes don't match the coin value needs an explanatory comment (exception record).
        return await ApplyMovementAsync(request.ShopId, request.CoinDenominationId, signedDelta, type, direction,
            request.NoteAmount, request.Comment, requireCommentOnMismatch: true, ct);
    }

    public async Task<CoinBagTransactionDto> AdjustAsync(CoinManualAdjustmentRequest request, CancellationToken cancellationToken = default)
    {
        await EnsureManageAsync(request.ShopId, cancellationToken);
        await EnsureShopSetupAsync(request.ShopId, cancellationToken);
        if (request.BagQuantity <= 0) throw new AppException("validation_failed", "Bag quantity must be greater than zero.", 400);
        if (string.IsNullOrWhiteSpace(request.Reason)) throw new AppException("reason_required", "A reason is required for a manual adjustment.", 400);

        var signedDelta = request.IncreaseStock ? request.BagQuantity : -request.BagQuantity;
        var direction = request.IncreaseStock ? CoinBagTransactionDirection.In : CoinBagTransactionDirection.Out;
        var comment = string.IsNullOrWhiteSpace(request.Comment) ? request.Reason.Trim() : $"{request.Reason.Trim()} — {request.Comment.Trim()}";

        return await ApplyMovementAsync(request.ShopId, request.CoinDenominationId, signedDelta, CoinBagTransactionType.ManualAdjustment,
            direction, noteAmount: null, comment, requireCommentOnMismatch: false, cancellationToken);
    }

    public Task<CoinBagTransactionDto> BankRefillAsync(CoinBankMovementRequest request, CancellationToken cancellationToken = default)
        => RecordBankMovementAsync(request, CoinBagTransactionType.BankRefill, increase: true, cancellationToken);

    public Task<CoinBagTransactionDto> BankRemovalAsync(CoinBankMovementRequest request, CancellationToken cancellationToken = default)
        => RecordBankMovementAsync(request, CoinBagTransactionType.BankDeposit, increase: false, cancellationToken);

    private async Task<CoinBagTransactionDto> RecordBankMovementAsync(CoinBankMovementRequest request, CoinBagTransactionType type, bool increase, CancellationToken ct)
    {
        await EnsureManageAsync(request.ShopId, ct);
        await EnsureShopSetupAsync(request.ShopId, ct);
        if (request.BagQuantity <= 0) throw new AppException("validation_failed", "Bag quantity must be greater than zero.", 400);

        var signedDelta = increase ? request.BagQuantity : -request.BagQuantity;
        var direction = increase ? CoinBagTransactionDirection.In : CoinBagTransactionDirection.Out;
        return await ApplyMovementAsync(request.ShopId, request.CoinDenominationId, signedDelta, type, direction,
            noteAmount: null, request.Comment, requireCommentOnMismatch: false, ct);
    }

    /// <summary>The single stock-changing pipeline: validate, write the transaction, recalculate stock,
    /// then evaluate alerts. All persisted in one unit of work.</summary>
    private async Task<CoinBagTransactionDto> ApplyMovementAsync(
        Guid shopId, Guid denominationId, int signedDelta, CoinBagTransactionType type, CoinBagTransactionDirection direction,
        decimal? noteAmount, string? comment, bool requireCommentOnMismatch, CancellationToken ct)
    {
        var (config, stock, denom) = await LoadTrackedAsync(shopId, denominationId, ct);
        if (!config.IsActive)
            throw new AppException("coin_denomination_inactive", $"{denom.DisplayLabel} coin bags are not managed at this shop.", 400);

        var previousQty = stock.CurrentBagQuantity;
        var newQty = previousQty + signedDelta;
        if (newQty < 0)
            throw new AppException("insufficient_coin_stock", $"Only {previousQty} {denom.DisplayLabel} coin bag(s) available.", 400);

        var bagQuantity = Math.Abs(signedDelta);
        var totalCoinValue = bagQuantity * config.BagValue;
        var noteAmt = noteAmount ?? 0m;
        var difference = noteAmount.HasValue ? noteAmt - totalCoinValue : 0m;

        if (requireCommentOnMismatch && difference != 0 && string.IsNullOrWhiteSpace(comment))
            throw new AppException("note_mismatch_reason_required",
                "The notes amount doesn't match the coin value — add a comment explaining the difference.", 400);

        var now = DateTimeOffset.UtcNow;
        var userId = _currentUser.UserId ?? Guid.Empty;

        var transaction = new CoinBagTransaction
        {
            ShopId = shopId,
            TransactionNumber = NextTransactionNumber(now),
            TransactionType = type,
            CoinDenominationId = denominationId,
            BagQuantity = bagQuantity,
            BagValue = config.BagValue,
            TotalCoinValue = totalCoinValue,
            NoteAmount = noteAmt,
            DifferenceAmount = difference,
            Direction = direction,
            Status = CoinBagTransactionStatus.Active,
            Comment = string.IsNullOrWhiteSpace(comment) ? null : comment.Trim(),
            PerformedByUserId = userId,
            PerformedOn = now,
            CreatedOn = now,
            CreatedBy = userId,
        };
        await _transactions.AddAsync(transaction, ct);

        stock.CurrentBagQuantity = newQty;
        stock.CurrentTotalValue = newQty * config.BagValue;
        stock.LastUpdatedOn = now;
        stock.LastUpdatedByUserId = userId;
        stock.ModifiedOn = now;
        stock.ModifiedBy = userId;
        _stocks.Update(stock);

        await _unitOfWork.SaveChangesAsync(ct);

        await EvaluateAlertAsync(config, denom, previousQty, newQty, transaction.Id, ct);

        await _auditService.LogAsync(nameof(CoinBagTransaction), transaction.Id, type.ToString(), shopId,
            oldValue: previousQty.ToString(), newValue: newQty.ToString(), reason: transaction.Comment, cancellationToken: ct);

        return MapTransaction(transaction, denom);
    }

    // -------------------------------------------------------------------
    // Alerts
    // -------------------------------------------------------------------

    /// <summary>Raise / resolve the single active alert for a denomination after a stock change, with
    /// duplicate-prevention: only a fresh crossing below the limit raises a new alert; rising back above
    /// resolves it.</summary>
    private async Task EvaluateAlertAsync(ShopCoinBagConfig config, CoinDenomination denom, int previousQty, int newQty, Guid transactionId, CancellationToken ct)
    {
        var active = await _alerts.Query()
            .FirstOrDefaultAsync(a => a.ShopId == config.ShopId && a.CoinDenominationId == config.CoinDenominationId
                && a.Status == CoinBagAlertStatus.Active, ct);

        var now = DateTimeOffset.UtcNow;

        // Stock back above the limit → resolve any active alert.
        if (newQty > config.StockAlertLimit)
        {
            if (active is not null)
            {
                active.Status = CoinBagAlertStatus.Resolved;
                active.ResolvedOn = now;
                active.ResolvedByTransactionId = transactionId;
                active.ModifiedOn = now;
                _alerts.Update(active);
                config.LastAlertResolvedOn = now;
                _configs.Update(config);
                await _unitOfWork.SaveChangesAsync(ct);
                await _auditService.LogAsync(nameof(CoinBagAlert), active.Id, "CoinAlertResolved", config.ShopId, cancellationToken: ct);
            }
            return;
        }

        // At or below the limit. Honour the per-denomination alert toggle.
        if (!config.IsAlertEnabled) return;

        var desiredType = newQty == 0 ? CoinBagAlertType.OutOfStock : CoinBagAlertType.LowStock;

        // Already alerting at the right severity → don't duplicate.
        if (active is not null && active.AlertType == desiredType) return;

        // Severity changed (e.g. low → out of stock): resolve the old, raise the new.
        if (active is not null)
        {
            active.Status = CoinBagAlertStatus.Resolved;
            active.ResolvedOn = now;
            active.ResolvedByTransactionId = transactionId;
            active.ModifiedOn = now;
            _alerts.Update(active);
        }

        var shopName = await _shops.Query().AsNoTracking()
            .Where(s => s.Id == config.ShopId).Select(s => s.ShopName).FirstOrDefaultAsync(ct) ?? "your shop";

        var message = BuildAlertMessage(desiredType, denom, shopName, newQty, config.StockAlertLimit);
        var alert = new CoinBagAlert
        {
            ShopId = config.ShopId,
            CoinDenominationId = config.CoinDenominationId,
            AlertType = desiredType,
            CurrentBagQuantity = newQty,
            StockAlertLimit = config.StockAlertLimit,
            Status = CoinBagAlertStatus.Active,
            Message = message,
            TriggeredOn = now,
            TriggeredByTransactionId = transactionId,
            CreatedOn = now,
        };
        await _alerts.AddAsync(alert, ct);
        config.LastAlertTriggeredOn = now;
        _configs.Update(config);
        await _unitOfWork.SaveChangesAsync(ct);

        await _auditService.LogAsync(nameof(CoinBagAlert), alert.Id,
            desiredType == CoinBagAlertType.OutOfStock ? "CoinOutOfStockAlertTriggered" : "CoinLowStockAlertTriggered",
            config.ShopId, cancellationToken: ct);

        await TrySendAlertNotificationAsync(config, denom, alert, shopName, ct);
    }

    private async Task TrySendAlertNotificationAsync(ShopCoinBagConfig config, CoinDenomination denom, CoinBagAlert alert, string shopName, CancellationToken ct)
    {
        try
        {
            var roles = config.AlertRecipientType switch
            {
                CoinBagAlertRecipientType.OwnersOnly => new[] { RoleNames.CompanyOwner },
                CoinBagAlertRecipientType.ManagersOnly => new[] { RoleNames.Manager },
                _ => new[] { RoleNames.CompanyOwner, RoleNames.Manager },
            };

            var recipientUserIds = await _shopUsers.Query().AsNoTracking()
                .Where(x => x.ShopId == config.ShopId && x.IsActive && roles.Contains(x.Role.Name))
                .Select(x => x.UserId)
                .Distinct()
                .ToListAsync(ct);
            if (recipientUserIds.Count == 0) return;

            var tokens = await _pushTokens.Query().AsNoTracking()
                .Where(t => t.ShopId == config.ShopId && t.IsActive && recipientUserIds.Contains(t.UserId))
                .Select(t => t.PushToken)
                .Distinct()
                .ToListAsync(ct);
            if (tokens.Count == 0) return;

            var isOutOfStock = alert.AlertType == CoinBagAlertType.OutOfStock;
            var subject = isOutOfStock ? $"Out of coin stock — {shopName}" : $"Low coin stock — {shopName}";

            foreach (var token in tokens)
            {
                try
                {
                    await _notificationService.SendAsync(new NotificationMessage
                    {
                        ShopId = config.ShopId,
                        NotificationType = isOutOfStock ? NotificationType.CoinOutOfStockAlert : NotificationType.CoinLowStockAlert,
                        Channel = NotificationChannel.InApp,
                        Recipient = token,
                        Subject = subject,
                        Body = alert.Message,
                        RelatedEntityName = nameof(CoinBagAlert),
                        RelatedEntityId = alert.Id,
                        IsPriority = isOutOfStock,
                    }, ct);
                }
                catch
                {
                    // Per-token delivery is best-effort; never block the transaction.
                }
            }
        }
        catch
        {
            // Coin alert notifications are best-effort.
        }
    }

    public async Task<IReadOnlyCollection<CoinBagAlertDto>> GetAlertsAsync(Guid shopId, CoinBagAlertStatus? status, CancellationToken cancellationToken = default)
    {
        await EnsureAccessAsync(shopId, cancellationToken);
        var denoms = await _denominations.Query().AsNoTracking().ToDictionaryAsync(d => d.Id, cancellationToken);

        var query = _alerts.Query().AsNoTracking().Where(a => a.ShopId == shopId);
        if (status is { } s) query = query.Where(a => a.Status == s);
        var alerts = await query.OrderByDescending(a => a.TriggeredOn).ToListAsync(cancellationToken);

        return alerts.Select(a => MapAlert(a, denoms.GetValueOrDefault(a.CoinDenominationId))).ToList();
    }

    public async Task<CoinBagAlertDto> DismissAlertAsync(Guid shopId, Guid alertId, CancellationToken cancellationToken = default)
    {
        await EnsureManageAsync(shopId, cancellationToken);
        var alert = await _alerts.Query()
            .FirstOrDefaultAsync(a => a.Id == alertId && a.ShopId == shopId, cancellationToken)
            ?? throw new AppException("coin_alert_not_found", "Alert not found.", 404);

        if (alert.Status == CoinBagAlertStatus.Active)
        {
            var now = DateTimeOffset.UtcNow;
            alert.Status = CoinBagAlertStatus.Dismissed;
            alert.DismissedOn = now;
            alert.DismissedByUserId = _currentUser.UserId;
            alert.ModifiedOn = now;
            _alerts.Update(alert);
            await _unitOfWork.SaveChangesAsync(cancellationToken);
            await _auditService.LogAsync(nameof(CoinBagAlert), alert.Id, "CoinAlertDismissed", shopId, cancellationToken: cancellationToken);
        }

        var denom = await _denominations.Query().AsNoTracking().FirstOrDefaultAsync(d => d.Id == alert.CoinDenominationId, cancellationToken);
        return MapAlert(alert, denom);
    }

    // -------------------------------------------------------------------
    // History
    // -------------------------------------------------------------------
    public async Task<IReadOnlyCollection<CoinBagTransactionDto>> GetTransactionsAsync(Guid shopId, DateOnly from, DateOnly to, Guid? coinDenominationId, CancellationToken cancellationToken = default)
    {
        await EnsureAccessAsync(shopId, cancellationToken);
        if (to < from) throw new AppException("validation_failed", "To date must be on or after from date.", 400);

        var start = new DateTimeOffset(from.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        var end = new DateTimeOffset(to.AddDays(1).ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);

        var denoms = await _denominations.Query().AsNoTracking().ToDictionaryAsync(d => d.Id, cancellationToken);

        var query = _transactions.Query().AsNoTracking()
            .Where(t => t.ShopId == shopId && t.PerformedOn >= start && t.PerformedOn < end);
        if (coinDenominationId is { } id) query = query.Where(t => t.CoinDenominationId == id);

        var transactions = await query.OrderByDescending(t => t.PerformedOn).ToListAsync(cancellationToken);
        return transactions.Select(t => MapTransaction(t, denoms.GetValueOrDefault(t.CoinDenominationId))).ToList();
    }

    public async Task<CoinBagTransactionDto> ReverseTransactionAsync(CoinReverseTransactionRequest request, CancellationToken cancellationToken = default)
    {
        await EnsureManageAsync(request.ShopId, cancellationToken);
        if (string.IsNullOrWhiteSpace(request.Reason))
            throw new AppException("reason_required", "A reason is required to reverse a transaction.", 400);

        var original = await _transactions.Query()
            .FirstOrDefaultAsync(t => t.Id == request.TransactionId && t.ShopId == request.ShopId, cancellationToken)
            ?? throw new AppException("coin_transaction_not_found", "Transaction not found.", 404);

        if (original.Status != CoinBagTransactionStatus.Active)
            throw new AppException("coin_transaction_not_active", "Only an active transaction can be reversed.", 400);
        if (original.TransactionType == CoinBagTransactionType.Reversal)
            throw new AppException("coin_transaction_not_reversible", "A reversal can't itself be reversed.", 400);

        var (config, stock, denom) = await LoadTrackedAsync(request.ShopId, original.CoinDenominationId, cancellationToken);

        // Undo the original's stock effect (In added bags, Out removed them).
        var originalDelta = original.Direction == CoinBagTransactionDirection.In ? original.BagQuantity : -original.BagQuantity;
        var reverseDelta = -originalDelta;
        var previousQty = stock.CurrentBagQuantity;
        var newQty = previousQty + reverseDelta;
        if (newQty < 0)
            throw new AppException("insufficient_coin_stock",
                $"Can't reverse — it would take stock below zero (only {previousQty} bag(s) on hand).", 400);

        var now = DateTimeOffset.UtcNow;
        var userId = _currentUser.UserId ?? Guid.Empty;
        var reverseDirection = reverseDelta >= 0 ? CoinBagTransactionDirection.In : CoinBagTransactionDirection.Out;

        var reversal = new CoinBagTransaction
        {
            ShopId = request.ShopId,
            TransactionNumber = NextTransactionNumber(now),
            TransactionType = CoinBagTransactionType.Reversal,
            CoinDenominationId = original.CoinDenominationId,
            BagQuantity = original.BagQuantity,
            BagValue = config.BagValue,
            TotalCoinValue = original.BagQuantity * config.BagValue,
            NoteAmount = original.NoteAmount,
            DifferenceAmount = 0,
            Direction = reverseDirection,
            Status = CoinBagTransactionStatus.Active,
            Comment = $"Reversal of {original.TransactionNumber}: {request.Reason.Trim()}",
            PerformedByUserId = userId,
            PerformedOn = now,
            CreatedOn = now,
            CreatedBy = userId,
        };
        await _transactions.AddAsync(reversal, cancellationToken);

        original.Status = CoinBagTransactionStatus.Reversed;
        original.CancelledOn = now;
        original.CancelledByUserId = userId;
        original.CancellationReason = request.Reason.Trim();
        original.ModifiedOn = now;
        original.ModifiedBy = userId;
        _transactions.Update(original);

        stock.CurrentBagQuantity = newQty;
        stock.CurrentTotalValue = newQty * config.BagValue;
        stock.LastUpdatedOn = now;
        stock.LastUpdatedByUserId = userId;
        stock.ModifiedOn = now;
        stock.ModifiedBy = userId;
        _stocks.Update(stock);

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await EvaluateAlertAsync(config, denom, previousQty, newQty, reversal.Id, cancellationToken);

        await _auditService.LogAsync(nameof(CoinBagTransaction), reversal.Id, "CoinTransactionReversed", request.ShopId,
            oldValue: previousQty.ToString(), newValue: newQty.ToString(), reason: request.Reason.Trim(), cancellationToken: cancellationToken);

        return MapTransaction(reversal, denom);
    }

    public async Task<CoinPodReportDto> GetReportAsync(Guid shopId, DateOnly from, DateOnly to, CancellationToken cancellationToken = default)
    {
        await _shopMembership.EnsureCurrentUserShopRoleAsync(shopId, ManageRoles, cancellationToken);
        await _featureGate.EnsureFeatureAsync(shopId, FeatureKeys.CoinPodReports, cancellationToken);
        if (to < from) throw new AppException("validation_failed", "To date must be on or after from date.", 400);
        await EnsureShopSetupAsync(shopId, cancellationToken);

        var start = new DateTimeOffset(from.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        var end = new DateTimeOffset(to.AddDays(1).ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);

        var stockRows = await BuildStockRowsAsync(shopId, cancellationToken);
        var denoms = await _denominations.Query().AsNoTracking().ToDictionaryAsync(d => d.Id, cancellationToken);

        var transactions = await _transactions.Query().AsNoTracking()
            .Where(t => t.ShopId == shopId && t.PerformedOn >= start && t.PerformedOn < end)
            .OrderByDescending(t => t.PerformedOn)
            .ToListAsync(cancellationToken);

        var movementSummary = transactions
            .GroupBy(t => t.TransactionType)
            .Select(g => new CoinMovementSummaryRowDto
            {
                TransactionType = g.Key.ToString(),
                Count = g.Count(),
                TotalBags = g.Sum(x => x.BagQuantity),
                TotalCoinValue = g.Sum(x => x.TotalCoinValue),
                TotalNoteAmount = g.Sum(x => x.NoteAmount),
            })
            .OrderBy(r => r.TransactionType)
            .ToList();

        var exceptions = transactions
            .Where(t => t.DifferenceAmount != 0)
            .Select(t => MapTransaction(t, denoms.GetValueOrDefault(t.CoinDenominationId)))
            .ToList();

        var alerts = await _alerts.Query().AsNoTracking()
            .Where(a => a.ShopId == shopId && a.TriggeredOn >= start && a.TriggeredOn < end)
            .OrderByDescending(a => a.TriggeredOn)
            .ToListAsync(cancellationToken);

        return new CoinPodReportDto
        {
            ShopId = shopId,
            From = from,
            To = to,
            TotalCoinValue = stockRows.Where(r => r.IsActive).Sum(r => r.CurrentTotalValue),
            StockSummary = stockRows,
            MovementSummary = movementSummary,
            Exceptions = exceptions,
            Alerts = alerts.Select(a => MapAlert(a, denoms.GetValueOrDefault(a.CoinDenominationId))).ToList(),
        };
    }

    // -------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------
    private async Task<(ShopCoinBagConfig Config, ShopCoinBagStock Stock, CoinDenomination Denom)> LoadTrackedAsync(Guid shopId, Guid denominationId, CancellationToken ct)
    {
        var denom = await _denominations.Query().AsNoTracking()
            .FirstOrDefaultAsync(d => d.Id == denominationId, ct)
            ?? throw new AppException("coin_denomination_not_found", "Coin denomination not found.", 404);
        var config = await _configs.Query()
            .FirstOrDefaultAsync(c => c.ShopId == shopId && c.CoinDenominationId == denominationId && !c.IsDeleted, ct)
            ?? throw new AppException("coin_config_not_found", "Coin bag configuration not found.", 404);
        var stock = await _stocks.Query()
            .FirstOrDefaultAsync(s => s.ShopId == shopId && s.CoinDenominationId == denominationId && !s.IsDeleted, ct)
            ?? throw new AppException("coin_stock_not_found", "Coin bag stock not found.", 404);
        return (config, stock, denom);
    }

    private static string DeriveStatus(ShopCoinBagConfig config, int qty)
    {
        if (!config.IsActive) return "Disabled";
        if (qty == 0) return "OutOfStock";
        if (qty <= config.StockAlertLimit) return "LowStock";
        return "Normal";
    }

    private static CoinBagAlertRecipientType ParseRecipientType(string? value)
        => Enum.TryParse<CoinBagAlertRecipientType>(value, ignoreCase: true, out var parsed)
            ? parsed
            : CoinBagAlertRecipientType.OwnersAndManagers;

    private static string NextTransactionNumber(DateTimeOffset now)
        => $"CP-{now:yyyyMMdd}-{Guid.NewGuid():N}"[..15].ToUpperInvariant();

    private static string BuildAlertMessage(CoinBagAlertType type, CoinDenomination denom, string shopName, int currentQty, int limit)
    {
        var sb = new StringBuilder();
        if (type == CoinBagAlertType.OutOfStock)
        {
            sb.Append($"Out of stock alert: {denom.DisplayLabel} coin bags are not available in {shopName}. ");
            sb.Append("Please arrange a coin refill.");
        }
        else
        {
            sb.Append($"Low coin stock: {shopName} has only {currentQty} bag(s) of {denom.DisplayLabel} coins remaining. ");
            sb.Append($"Stock alert limit is {limit} bag(s).");
        }
        return sb.ToString();
    }

    private static CoinBagConfigDto MapConfig(ShopCoinBagConfig c, CoinDenomination denom, int currentQty) => new()
    {
        Id = c.Id,
        ShopId = c.ShopId,
        CoinDenominationId = c.CoinDenominationId,
        Code = denom.Code,
        DisplayLabel = denom.DisplayLabel,
        Name = denom.Name,
        CoinValue = denom.CoinValue,
        SortOrder = denom.SortOrder,
        BagValue = c.BagValue,
        MinBagQuantity = c.MinBagQuantity,
        MaxBagQuantity = c.MaxBagQuantity,
        OpeningBagQuantity = c.OpeningBagQuantity,
        StockAlertLimit = c.StockAlertLimit,
        IsAlertEnabled = c.IsAlertEnabled,
        AlertRecipientType = c.AlertRecipientType.ToString(),
        IsActive = c.IsActive,
        CurrentBagQuantity = currentQty,
    };

    private static CoinBagTransactionDto MapTransaction(CoinBagTransaction t, CoinDenomination? denom) => new()
    {
        Id = t.Id,
        ShopId = t.ShopId,
        TransactionNumber = t.TransactionNumber,
        TransactionType = t.TransactionType.ToString(),
        CoinDenominationId = t.CoinDenominationId,
        Code = denom?.Code ?? string.Empty,
        DisplayLabel = denom?.DisplayLabel ?? string.Empty,
        BagQuantity = t.BagQuantity,
        BagValue = t.BagValue,
        TotalCoinValue = t.TotalCoinValue,
        NoteAmount = t.NoteAmount,
        DifferenceAmount = t.DifferenceAmount,
        Direction = t.Direction.ToString(),
        Status = t.Status.ToString(),
        Comment = t.Comment,
        PerformedByUserId = t.PerformedByUserId,
        PerformedOn = t.PerformedOn,
    };

    private static CoinBagAlertDto MapAlert(CoinBagAlert a, CoinDenomination? denom) => new()
    {
        Id = a.Id,
        ShopId = a.ShopId,
        CoinDenominationId = a.CoinDenominationId,
        Code = denom?.Code ?? string.Empty,
        DisplayLabel = denom?.DisplayLabel ?? string.Empty,
        AlertType = a.AlertType.ToString(),
        CurrentBagQuantity = a.CurrentBagQuantity,
        StockAlertLimit = a.StockAlertLimit,
        Status = a.Status.ToString(),
        Message = a.Message,
        TriggeredOn = a.TriggeredOn,
        ResolvedOn = a.ResolvedOn,
    };
}
