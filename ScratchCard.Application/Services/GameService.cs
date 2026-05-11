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
    private readonly IAuditService _auditService;
    private readonly ICurrentUserService _currentUserService;
    private readonly IUnitOfWork _unitOfWork;

    public GameService(
        IRepository<ScratchCardGame> masterGameRepository,
        IRepository<ShopScratchCardGame> shopGameRepository,
        IAuditService auditService,
        ICurrentUserService currentUserService,
        IUnitOfWork unitOfWork)
    {
        _masterGameRepository = masterGameRepository;
        _shopGameRepository = shopGameRepository;
        _auditService = auditService;
        _currentUserService = currentUserService;
        _unitOfWork = unitOfWork;
    }

    public async Task<GameDto> CreateAsync(CreateGameRequest request, CancellationToken cancellationToken = default)
    {
        var normalizedGameCode = NormalizeGameCode(request.GameCode);
        ValidateGameCode(normalizedGameCode);

        var masterGame = await _masterGameRepository.Query()
            .FirstOrDefaultAsync(x => x.GameCode == normalizedGameCode && !x.IsDeleted, cancellationToken);

        if (masterGame is null)
        {
            masterGame = new ScratchCardGame
            {
                GameCode = normalizedGameCode,
                GameName = request.GameName.Trim(),
                TicketPrice = request.DefaultTicketPrice,
                TicketsPerPack = request.DefaultTicketsPerPack,
                IsActive = true,
                CreatedOn = DateTimeOffset.UtcNow,
                CreatedBy = _currentUserService.UserId
            };

            await _masterGameRepository.AddAsync(masterGame, cancellationToken);
            await _unitOfWork.SaveChangesAsync(cancellationToken);
        }

        var duplicate = await _shopGameRepository.Query().AnyAsync(
            x => x.ShopId == request.ShopId && x.MasterGameId == masterGame.Id && !x.IsDeleted,
            cancellationToken);

        if (duplicate)
        {
            throw new AppException("duplicate_game_code", "Game code must be unique per shop.");
        }

        var shopGame = new ShopScratchCardGame
        {
            ShopId = request.ShopId,
            MasterGameId = masterGame.Id,
            DefaultStartSerialNumber = request.DefaultStartSerialNumber,
            DefaultEndSerialNumber = request.DefaultEndSerialNumber,
            DefaultSellingOrder = NormalizeSellingOrder(request.DefaultSellingOrder),
            IsActive = request.IsActive,
            CreatedOn = DateTimeOffset.UtcNow,
            CreatedBy = _currentUserService.UserId
        };

        await _shopGameRepository.AddAsync(shopGame, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(nameof(ScratchCardGame), masterGame.Id, "MasterGameAssignedToShop", request.ShopId, cancellationToken: cancellationToken);

        var persisted = await _shopGameRepository.Query()
            .AsNoTracking()
            .Include(x => x.MasterGame)
            .FirstAsync(x => x.Id == shopGame.Id, cancellationToken);
        return persisted.ToDto();
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
