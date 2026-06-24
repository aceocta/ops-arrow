using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Games;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Entities;
using ScratchCard.Domain.Enums;
using System.Text.RegularExpressions;

namespace ScratchCard.Application.Services;

public class GameService : IGameService
{
    private static readonly Regex GameCodeRegex = new("^[0-9A-Z]{2,20}$", RegexOptions.Compiled);

    private static SellingOrder NormalizeSellingOrder(SellingOrder sellingOrder) =>
        sellingOrder == (SellingOrder)0 ? SellingOrder.Ascending : sellingOrder;

    private static string NormalizeGameCode(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        return Regex.Replace(value, @"[^0-9A-Za-z]", string.Empty).Trim().ToUpperInvariant();
    }

    private static void ValidateGameCode(string normalizedGameCode)
    {
        if (!GameCodeRegex.IsMatch(normalizedGameCode))
        {
            throw new AppException("invalid_game_code", "Game code must be 2 to 20 uppercase alphanumeric characters.", 400);
        }
    }

    private readonly IRepository<ScratchCardGame> _masterGameRepository;
    private readonly IRepository<ShopScratchCardGame> _shopGameRepository;
    private readonly IRepository<Shop> _shopRepository;
    private readonly IRepository<Company> _companyRepository;
    private readonly IAuditService _auditService;
    private readonly ICurrentUserService _currentUserService;
    private readonly IUnitOfWork _unitOfWork;

    public GameService(
        IRepository<ScratchCardGame> masterGameRepository,
        IRepository<ShopScratchCardGame> shopGameRepository,
        IRepository<Shop> shopRepository,
        IRepository<Company> companyRepository,
        IAuditService auditService,
        ICurrentUserService currentUserService,
        IUnitOfWork unitOfWork)
    {
        _masterGameRepository = masterGameRepository;
        _shopGameRepository = shopGameRepository;
        _shopRepository = shopRepository;
        _companyRepository = companyRepository;
        _auditService = auditService;
        _currentUserService = currentUserService;
        _unitOfWork = unitOfWork;
    }

    // Resolves the set of shops a create/assign should target: just this shop, or every shop in the
    // company when the caller chose "Company" scope (falls back to this shop if it has no company).
    private async Task<IReadOnlyList<Guid>> ResolveScopeShopIdsAsync(
        Guid shopId, Guid? companyId, GameAssignScope scope, CancellationToken cancellationToken)
    {
        if (scope == GameAssignScope.Company && companyId.HasValue)
        {
            var ids = await _shopRepository.Query()
                .Where(s => s.CompanyId == companyId.Value)
                .Select(s => s.Id)
                .ToListAsync(cancellationToken);
            if (ids.Count > 0)
            {
                if (!ids.Contains(shopId)) ids.Add(shopId);
                return ids;
            }
        }

        return new[] { shopId };
    }

    private ShopScratchCardGame BuildShopLink(Guid shopId, Guid masterGameId, string startSerial, string endSerial, SellingOrder sellingOrder, bool isActive) => new()
    {
        ShopId = shopId,
        MasterGameId = masterGameId,
        DefaultStartSerialNumber = startSerial,
        DefaultEndSerialNumber = endSerial,
        DefaultSellingOrder = NormalizeSellingOrder(sellingOrder),
        IsActive = isActive,
        CreatedOn = DateTimeOffset.UtcNow,
        CreatedBy = _currentUserService.UserId,
    };

    public async Task<CreateGameResult> CreateAsync(CreateGameRequest request, CancellationToken cancellationToken = default)
    {
        var normalizedGameCode = NormalizeGameCode(request.GameCode);
        ValidateGameCode(normalizedGameCode);

        // If the code already exists anywhere on the platform (pending OR approved), do not silently
        // create/assign — surface it so the app can prompt the user to assign the existing game.
        var existing = await _masterGameRepository.Query()
            .FirstOrDefaultAsync(x => x.GameCode == normalizedGameCode && !x.IsDeleted, cancellationToken);
        if (existing is not null)
        {
            var alreadyAssigned = await _shopGameRepository.Query().AnyAsync(
                x => x.ShopId == request.ShopId && x.MasterGameId == existing.Id && !x.IsDeleted,
                cancellationToken);

            return new CreateGameResult
            {
                Outcome = "DuplicateExists",
                Duplicate = new DuplicateGameInfo
                {
                    MasterGameId = existing.Id,
                    GameName = existing.GameName,
                    GameCode = existing.GameCode,
                    ApprovalStatus = existing.ApprovalStatus,
                    AlreadyAssignedToShop = alreadyAssigned,
                },
            };
        }

        var shop = await _shopRepository.GetByIdAsync(request.ShopId, cancellationToken)
            ?? throw new AppException("shop_not_found", "Shop not found.", 404);

        var masterGame = new ScratchCardGame
        {
            GameCode = normalizedGameCode,
            GameName = request.GameName.Trim(),
            TicketPrice = request.DefaultTicketPrice,
            TicketsPerPack = request.DefaultTicketsPerPack,
            IsActive = true,
            ApprovalStatus = ApprovalStatus.Pending,
            OriginShopId = request.ShopId,
            OriginCompanyId = shop.CompanyId,
            CreatedOn = DateTimeOffset.UtcNow,
            CreatedBy = _currentUserService.UserId,
        };
        await _masterGameRepository.AddAsync(masterGame, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        var targetShopIds = await ResolveScopeShopIdsAsync(request.ShopId, shop.CompanyId, request.AssignScope, cancellationToken);
        foreach (var targetShopId in targetShopIds)
        {
            await _shopGameRepository.AddAsync(
                BuildShopLink(targetShopId, masterGame.Id, request.DefaultStartSerialNumber, request.DefaultEndSerialNumber, request.DefaultSellingOrder, request.IsActive),
                cancellationToken);
        }
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(nameof(ScratchCardGame), masterGame.Id, "GameCreatedPendingApproval", request.ShopId, cancellationToken: cancellationToken);

        var persisted = await _shopGameRepository.Query()
            .AsNoTracking()
            .Include(x => x.MasterGame)
            .FirstAsync(x => x.MasterGameId == masterGame.Id && x.ShopId == request.ShopId, cancellationToken);
        return new CreateGameResult { Outcome = "Created", Game = persisted.ToDto() };
    }

    public async Task<GameDto> AssignExistingAsync(AssignExistingGameRequest request, CancellationToken cancellationToken = default)
    {
        var masterGame = await _masterGameRepository.Query()
            .FirstOrDefaultAsync(x => x.Id == request.MasterGameId && !x.IsDeleted, cancellationToken)
            ?? throw new AppException("game_not_found", "Game not found.", 404);

        var shop = await _shopRepository.GetByIdAsync(request.ShopId, cancellationToken)
            ?? throw new AppException("shop_not_found", "Shop not found.", 404);

        var targetShopIds = await ResolveScopeShopIdsAsync(request.ShopId, shop.CompanyId, request.Scope, cancellationToken);

        var alreadyLinked = await _shopGameRepository.Query()
            .Where(x => targetShopIds.Contains(x.ShopId) && x.MasterGameId == masterGame.Id && !x.IsDeleted)
            .Select(x => x.ShopId)
            .ToListAsync(cancellationToken);
        var alreadyLinkedSet = alreadyLinked.ToHashSet();

        foreach (var targetShopId in targetShopIds)
        {
            if (alreadyLinkedSet.Contains(targetShopId)) continue;
            await _shopGameRepository.AddAsync(
                BuildShopLink(targetShopId, masterGame.Id, request.DefaultStartSerialNumber, request.DefaultEndSerialNumber, request.DefaultSellingOrder, request.IsActive),
                cancellationToken);
        }
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(nameof(ScratchCardGame), masterGame.Id, "ExistingGameAssignedToShop", request.ShopId, cancellationToken: cancellationToken);

        var persisted = await _shopGameRepository.Query()
            .AsNoTracking()
            .Include(x => x.MasterGame)
            .FirstAsync(x => x.MasterGameId == masterGame.Id && x.ShopId == request.ShopId, cancellationToken);
        return persisted.ToDto();
    }

    public async Task<IReadOnlyCollection<PendingGameDto>> ListPendingAsync(CancellationToken cancellationToken = default)
    {
        var pending = await _masterGameRepository.Query()
            .AsNoTracking()
            .Where(x => x.ApprovalStatus == ApprovalStatus.Pending && !x.IsDeleted)
            .OrderBy(x => x.CreatedOn)
            .ToListAsync(cancellationToken);
        if (pending.Count == 0) return Array.Empty<PendingGameDto>();

        var masterIds = pending.Select(x => x.Id).ToList();
        var counts = (await _shopGameRepository.Query().AsNoTracking()
                .Where(x => masterIds.Contains(x.MasterGameId) && !x.IsDeleted)
                .GroupBy(x => x.MasterGameId)
                .Select(g => new { MasterGameId = g.Key, Count = g.Count() })
                .ToListAsync(cancellationToken))
            .ToDictionary(x => x.MasterGameId, x => x.Count);

        var shopIds = pending.Where(x => x.OriginShopId.HasValue).Select(x => x.OriginShopId!.Value).Distinct().ToList();
        var shopNames = (await _shopRepository.Query().AsNoTracking()
                .Where(s => shopIds.Contains(s.Id))
                .Select(s => new { s.Id, s.ShopName })
                .ToListAsync(cancellationToken))
            .ToDictionary(x => x.Id, x => x.ShopName);

        var companyIds = pending.Where(x => x.OriginCompanyId.HasValue).Select(x => x.OriginCompanyId!.Value).Distinct().ToList();
        var companyNames = (await _companyRepository.Query().AsNoTracking()
                .Where(c => companyIds.Contains(c.Id))
                .Select(c => new { c.Id, c.CompanyName })
                .ToListAsync(cancellationToken))
            .ToDictionary(x => x.Id, x => x.CompanyName);

        return pending.Select(x => new PendingGameDto
        {
            MasterGameId = x.Id,
            GameName = x.GameName,
            GameCode = x.GameCode,
            TicketPrice = x.TicketPrice,
            TicketsPerPack = x.TicketsPerPack,
            OriginShopId = x.OriginShopId,
            OriginShopName = x.OriginShopId.HasValue && shopNames.TryGetValue(x.OriginShopId.Value, out var sn) ? sn : null,
            OriginCompanyId = x.OriginCompanyId,
            OriginCompanyName = x.OriginCompanyId.HasValue && companyNames.TryGetValue(x.OriginCompanyId.Value, out var cn) ? cn : null,
            AssignedShopCount = counts.TryGetValue(x.Id, out var c) ? c : 0,
            CreatedOn = x.CreatedOn,
        }).ToArray();
    }

    public async Task ApproveAsync(Guid masterGameId, CancellationToken cancellationToken = default)
    {
        var masterGame = await _masterGameRepository.GetByIdAsync(masterGameId, cancellationToken)
            ?? throw new AppException("game_not_found", "Game not found.", 404);

        if (masterGame.ApprovalStatus == ApprovalStatus.Approved) return;

        masterGame.ApprovalStatus = ApprovalStatus.Approved;
        masterGame.ApprovedByUserId = _currentUserService.UserId;
        masterGame.ApprovedOn = DateTimeOffset.UtcNow;
        masterGame.RejectionReason = null;
        masterGame.IsActive = true;
        masterGame.ModifiedOn = DateTimeOffset.UtcNow;
        masterGame.ModifiedBy = _currentUserService.UserId;
        _masterGameRepository.Update(masterGame);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(nameof(ScratchCardGame), masterGame.Id, "GameApproved", cancellationToken: cancellationToken);
    }

    public async Task RejectAsync(Guid masterGameId, string? reason, CancellationToken cancellationToken = default)
    {
        var masterGame = await _masterGameRepository.GetByIdAsync(masterGameId, cancellationToken)
            ?? throw new AppException("game_not_found", "Game not found.", 404);

        masterGame.ApprovalStatus = ApprovalStatus.Rejected;
        masterGame.RejectionReason = string.IsNullOrWhiteSpace(reason) ? null : reason.Trim();
        masterGame.ModifiedOn = DateTimeOffset.UtcNow;
        masterGame.ModifiedBy = _currentUserService.UserId;
        _masterGameRepository.Update(masterGame);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(nameof(ScratchCardGame), masterGame.Id, "GameRejected", cancellationToken: cancellationToken);
    }

    public async Task<GameDto> UpdateAsync(Guid id, UpdateGameRequest request, CancellationToken cancellationToken = default)
    {
        var shopGame = await _shopGameRepository.Query()
            .Include(x => x.MasterGame)
            .FirstOrDefaultAsync(x => x.Id == id && !x.IsDeleted, cancellationToken)
            ?? throw new AppException("game_not_found", "Game not found.", 404);

        var isPlatformAdmin = _currentUserService.IsInRole(RoleNames.PlatformAdmin);
        var normalizedGameCode = NormalizeGameCode(request.GameCode);
        ValidateGameCode(normalizedGameCode);

        var targetMaster = shopGame.MasterGame;
        if (isPlatformAdmin)
        {
            targetMaster = await _masterGameRepository.Query()
                .FirstOrDefaultAsync(x => x.GameCode == normalizedGameCode && !x.IsDeleted, cancellationToken);

            if (targetMaster is null)
            {
                targetMaster = new ScratchCardGame
                {
                    GameCode = normalizedGameCode,
                    GameName = request.GameName.Trim(),
                    TicketPrice = request.DefaultTicketPrice,
                    TicketsPerPack = request.DefaultTicketsPerPack,
                    IsActive = true,
                    // PlatformAdmin-authored master games are authoritative — approved on creation.
                    ApprovalStatus = ApprovalStatus.Approved,
                    ApprovedByUserId = _currentUserService.UserId,
                    ApprovedOn = DateTimeOffset.UtcNow,
                    CreatedOn = DateTimeOffset.UtcNow,
                    CreatedBy = _currentUserService.UserId
                };

                await _masterGameRepository.AddAsync(targetMaster, cancellationToken);
                await _unitOfWork.SaveChangesAsync(cancellationToken);
            }
        }
        else
        {
            var requestedName = request.GameName.Trim();
            var changesMasterGame =
                normalizedGameCode != shopGame.MasterGame.GameCode ||
                requestedName != shopGame.MasterGame.GameName ||
                request.DefaultTicketPrice != shopGame.MasterGame.TicketPrice ||
                request.DefaultTicketsPerPack != shopGame.MasterGame.TicketsPerPack;

            if (changesMasterGame)
            {
                throw new AppException(
                    "forbidden_master_game_edit",
                    "Only PlatformAdmin can edit master scratch card games once created.",
                    403);
            }
        }

        var duplicate = await _shopGameRepository.Query().AnyAsync(
            x => x.Id != id && x.ShopId == request.ShopId && x.MasterGameId == targetMaster.Id && !x.IsDeleted,
            cancellationToken);

        if (duplicate)
        {
            throw new AppException("duplicate_game_code", "Game code must be unique per shop.");
        }

        shopGame.MasterGameId = targetMaster.Id;
        shopGame.DefaultStartSerialNumber = request.DefaultStartSerialNumber;
        shopGame.DefaultEndSerialNumber = request.DefaultEndSerialNumber;
        shopGame.DefaultSellingOrder = NormalizeSellingOrder(request.DefaultSellingOrder);
        shopGame.IsActive = request.IsActive;
        shopGame.ModifiedOn = DateTimeOffset.UtcNow;
        shopGame.ModifiedBy = _currentUserService.UserId;

        if (isPlatformAdmin)
        {
            targetMaster.GameName = request.GameName.Trim();
            targetMaster.TicketPrice = request.DefaultTicketPrice;
            targetMaster.TicketsPerPack = request.DefaultTicketsPerPack;
            targetMaster.IsActive = true;
            targetMaster.ModifiedOn = DateTimeOffset.UtcNow;
            targetMaster.ModifiedBy = _currentUserService.UserId;
        }

        _shopGameRepository.Update(shopGame);
        if (isPlatformAdmin)
        {
            _masterGameRepository.Update(targetMaster);
        }
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(nameof(ScratchCardGame), targetMaster.Id, "GameUpdated", shopGame.ShopId, cancellationToken: cancellationToken);

        var persisted = await _shopGameRepository.Query()
            .AsNoTracking()
            .Include(x => x.MasterGame)
            .FirstAsync(x => x.Id == shopGame.Id, cancellationToken);
        return persisted.ToDto();
    }

    public async Task<IReadOnlyCollection<GameDto>> ListAsync(Guid shopId, CancellationToken cancellationToken = default)
    {
        var games = await _shopGameRepository.Query()
            .AsNoTracking()
            .Include(x => x.MasterGame)
            .Where(x => x.ShopId == shopId && !x.IsDeleted && !x.MasterGame.IsDeleted)
            .OrderBy(x => x.MasterGame.GameName)
            .ToListAsync(cancellationToken);

        return games.Select(x => x.ToDto()).ToArray();
    }

    public async Task DeactivateAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var game = await _shopGameRepository.GetByIdAsync(id, cancellationToken)
            ?? throw new AppException("game_not_found", "Game not found.", 404);

        game.IsActive = false;
        game.ModifiedOn = DateTimeOffset.UtcNow;
        game.ModifiedBy = _currentUserService.UserId;
        _shopGameRepository.Update(game);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(nameof(ScratchCardGame), game.Id, "GameDeactivated", game.ShopId, cancellationToken: cancellationToken);
    }
}
