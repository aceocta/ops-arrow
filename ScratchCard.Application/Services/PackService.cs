using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Packs;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Entities;
using ScratchCard.Domain.Enums;
using System.Text.RegularExpressions;

namespace ScratchCard.Application.Services;

public class PackService : IPackService
{
    private static readonly Regex CodeAndPackRegex = new(
        @"(?<game>[0-9A-Za-z]{2,20})\s*[-]\s*(?<pack>[0-9A-Za-z]{3,16})",
        RegexOptions.Compiled);

    private readonly IRepository<ScratchCardPack> _packRepository;
    private readonly IRepository<ShopScratchCardGame> _shopGameRepository;
    private readonly IShopConfigurationService _shopConfigurationService;
    private readonly IAuditService _auditService;
    private readonly ICurrentUserService _currentUserService;
    private readonly IUnitOfWork _unitOfWork;

    public PackService(
        IRepository<ScratchCardPack> packRepository,
        IRepository<ShopScratchCardGame> shopGameRepository,
        IShopConfigurationService shopConfigurationService,
        IAuditService auditService,
        ICurrentUserService currentUserService,
        IUnitOfWork unitOfWork)
    {
        _packRepository = packRepository;
        _shopGameRepository = shopGameRepository;
        _shopConfigurationService = shopConfigurationService;
        _auditService = auditService;
        _currentUserService = currentUserService;
        _unitOfWork = unitOfWork;
    }

    public async Task<PackDto> CreateManualAsync(CreateManualPackRequest request, CancellationToken cancellationToken = default)
    {
        var game = await _shopGameRepository.Query()
            .AsNoTracking()
            .Include(x => x.MasterGame)
            .FirstOrDefaultAsync(
                x => x.Id == request.GameId &&
                     x.ShopId == request.ShopId &&
                     x.IsActive &&
                     !x.IsDeleted &&
                     x.MasterGame.IsActive &&
                     !x.MasterGame.IsDeleted,
                cancellationToken)
            ?? throw new AppException("invalid_game", "Game is invalid or inactive.");

        var normalizedGameCode = NormalizeGameCode(game.MasterGame.GameCode);
        if (string.IsNullOrWhiteSpace(normalizedGameCode))
        {
            throw new AppException("invalid_game", "Game code is invalid.");
        }

        var normalizedPackNumber = NormalizePackNumberForGame(request.PackNumber, normalizedGameCode);
        var duplicatePack = await _packRepository.Query().AnyAsync(
            x => x.ShopId == request.ShopId && !x.IsDeleted && x.PackNumber == normalizedPackNumber,
            cancellationToken);
        if (duplicatePack)
        {
            throw new AppException(ErrorCodes.DuplicatePackNumber, "Pack number must be unique per shop.");
        }

        var startSerial = request.StartSerialNumber.Trim();
        var endSerial = request.EndSerialNumber.Trim();
        ValidateSerialRange(startSerial, endSerial);

        var packSetup = await _shopConfigurationService.GetPackSetupAsync(request.ShopId, cancellationToken);
        var sellingOrder = packSetup.SellingOrder;
        var openingSerial = GetDefaultOpeningSerial(startSerial, endSerial, sellingOrder);
        ValidateSerialInRange(openingSerial, startSerial, endSerial);

        var now = DateTimeOffset.UtcNow;
        var pack = new ScratchCardPack
        {
            ShopId = request.ShopId,
            GameId = game.MasterGameId,
            PackNumber = normalizedPackNumber,
            DisplayNumber = request.DisplayNumber,
            TicketPrice = request.TicketPrice,
            TotalTickets = request.TotalTickets,
            StartSerialNumber = startSerial,
            EndSerialNumber = endSerial,
            SellingOrder = sellingOrder,
            CurrentSerialNumber = openingSerial,
            Status = PackStatus.Active,
            IsManuallyAdded = true,
            ReceivedDate = now,
            ActivatedDate = now,
            ActivatedByUserId = _currentUserService.UserId,
            Notes = request.Notes,
            CreatedOn = now,
            CreatedBy = _currentUserService.UserId
        };

        await _packRepository.AddAsync(pack, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(nameof(ScratchCardPack), pack.Id, "PackCreatedManual", pack.ShopId, cancellationToken: cancellationToken);

        var createdPack = await GetPackEntityAsync(pack.Id, cancellationToken);
        return createdPack.ToDto();
    }

    public async Task<IReadOnlyCollection<PackDto>> ListAsync(Guid shopId, CancellationToken cancellationToken = default)
    {
        var packSetup = await _shopConfigurationService.GetPackSetupAsync(shopId, cancellationToken);
        var packs = await _packRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && !x.IsDeleted)
            .Include(x => x.Game)
            .OrderByDescending(x => x.ReceivedDate)
            .ToListAsync(cancellationToken);

        return packs
            .Select(x =>
            {
                var dto = x.ToDto();
                dto.SellingOrder = packSetup.SellingOrder;
                return dto;
            })
            .ToArray();
    }

    public async Task<PackDto> GetAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var pack = await GetPackEntityAsync(id, cancellationToken);
        var dto = pack.ToDto();
        dto.SellingOrder = (await _shopConfigurationService.GetPackSetupAsync(pack.ShopId, cancellationToken)).SellingOrder;
        return dto;
    }

    public async Task<PackDto> UpdateDetailsAsync(Guid id, UpdatePackDetailsRequest request, CancellationToken cancellationToken = default)
    {
        var pack = await GetPackEntityAsync(id, cancellationToken);

        if (pack.Status is not (PackStatus.InStock or PackStatus.Paused))
        {
            throw new AppException("pack_edit_not_allowed", "Pack details can only be edited while status is InStock or Paused.");
        }

        var normalizedPackNumber = request.PackNumber.Trim().ToUpperInvariant();
        var duplicatePack = await _packRepository.Query().AnyAsync(
            x => x.Id != id && x.ShopId == pack.ShopId && !x.IsDeleted && x.PackNumber == normalizedPackNumber,
            cancellationToken);

        if (duplicatePack)
        {
            throw new AppException(ErrorCodes.DuplicatePackNumber, "Pack number must be unique per shop.");
        }

        ValidateSerialRange(request.StartSerialNumber, request.EndSerialNumber);
        ValidateSerialInRange(pack.CurrentSerialNumber, request.StartSerialNumber, request.EndSerialNumber);

        pack.PackNumber = normalizedPackNumber;
        pack.DisplayNumber = request.DisplayNumber;
        pack.TicketPrice = request.TicketPrice;
        pack.TotalTickets = request.TotalTickets;
        pack.StartSerialNumber = request.StartSerialNumber.Trim();
        pack.EndSerialNumber = request.EndSerialNumber.Trim();
        pack.SellingOrder = (await _shopConfigurationService.GetPackSetupAsync(pack.ShopId, cancellationToken)).SellingOrder;
        pack.ModifiedOn = DateTimeOffset.UtcNow;
        pack.ModifiedBy = _currentUserService.UserId;

        _packRepository.Update(pack);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(nameof(ScratchCardPack), pack.Id, "PackDetailsUpdated", pack.ShopId, cancellationToken: cancellationToken);
        return pack.ToDto();
    }

    public async Task<PackDto> ActivateAsync(Guid id, ActivatePackRequest request, CancellationToken cancellationToken = default)
    {
        var pack = await GetPackEntityAsync(id, cancellationToken);

        if (pack.Status is not (PackStatus.InStock or PackStatus.Paused))
        {
            throw new AppException(ErrorCodes.PackNotActive, "Only InStock or Paused packs can be activated.");
        }

        ValidateSerialInRange(request.OpeningSerialNumber, pack.StartSerialNumber, pack.EndSerialNumber);

        pack.SellingOrder = (await _shopConfigurationService.GetPackSetupAsync(pack.ShopId, cancellationToken)).SellingOrder;
        pack.CurrentSerialNumber = request.OpeningSerialNumber;
        pack.Status = PackStatus.Active;
        pack.ActivatedDate = DateTimeOffset.UtcNow;
        pack.ActivatedByUserId = _currentUserService.UserId;
        pack.ModifiedOn = DateTimeOffset.UtcNow;
        pack.ModifiedBy = _currentUserService.UserId;

        _packRepository.Update(pack);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(nameof(ScratchCardPack), pack.Id, "PackActivated", pack.ShopId, cancellationToken: cancellationToken);
        return pack.ToDto();
    }

    public Task<PackDto> PauseAsync(Guid id, UpdatePackStatusRequest request, CancellationToken cancellationToken = default)
        => SetStatusAsync(id, PackStatus.Paused, "PackPaused", request, cancellationToken);

    public Task<PackDto> ReturnAsync(Guid id, UpdatePackStatusRequest request, CancellationToken cancellationToken = default)
        => SetStatusAsync(id, PackStatus.Returned, "PackReturned", request, cancellationToken);

    public Task<PackDto> MarkIssueAsync(Guid id, UpdatePackStatusRequest request, CancellationToken cancellationToken = default)
        => SetStatusAsync(id, PackStatus.Issue, "PackIssueMarked", request, cancellationToken);

    public Task<PackDto> CompleteAsync(Guid id, UpdatePackStatusRequest request, CancellationToken cancellationToken = default)
        => SetStatusAsync(id, PackStatus.Completed, "PackCompleted", request, cancellationToken);

    private async Task<PackDto> SetStatusAsync(Guid id, PackStatus status, string auditAction, UpdatePackStatusRequest request, CancellationToken cancellationToken)
    {
        var pack = await GetPackEntityAsync(id, cancellationToken);

        pack.Status = status;
        pack.Notes = request.Notes;
        pack.ModifiedOn = DateTimeOffset.UtcNow;
        pack.ModifiedBy = _currentUserService.UserId;

        if (status == PackStatus.Completed)
        {
            pack.CompletedDate = DateTimeOffset.UtcNow;
        }

        if (status == PackStatus.Returned)
        {
            pack.ReturnedDate = DateTimeOffset.UtcNow;
        }

        _packRepository.Update(pack);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        await _auditService.LogAsync(nameof(ScratchCardPack), pack.Id, auditAction, pack.ShopId, cancellationToken: cancellationToken);

        return pack.ToDto();
    }

    private async Task<ScratchCardPack> GetPackEntityAsync(Guid id, CancellationToken cancellationToken)
    {
        return await _packRepository.Query()
            .Include(x => x.Game)
            .FirstOrDefaultAsync(x => x.Id == id && !x.IsDeleted, cancellationToken)
            ?? throw new AppException(ErrorCodes.PackNotFound, "Pack not found.", 404);
    }

    private static void ValidateSerialInRange(string serial, string start, string end)
    {
        if (!int.TryParse(serial, out var serialNo) || !int.TryParse(start, out var startNo) || !int.TryParse(end, out var endNo))
        {
            throw new AppException(ErrorCodes.InvalidSerialRange, "Serial numbers must be numeric.");
        }

        var min = Math.Min(startNo, endNo);
        var max = Math.Max(startNo, endNo);
        if (serialNo < min || serialNo > max)
        {
            throw new AppException(ErrorCodes.InvalidSerialRange, "Opening serial must be within pack range.");
        }
    }

    private static void ValidateSerialRange(string start, string end)
    {
        if (!int.TryParse(start, out var startNo) || !int.TryParse(end, out var endNo))
        {
            throw new AppException(ErrorCodes.InvalidSerialRange, "Serial numbers must be numeric.");
        }

        if (startNo == endNo)
        {
            throw new AppException(ErrorCodes.InvalidSerialRange, "Start serial and end serial cannot be the same.");
        }
    }

    private static string GetDefaultOpeningSerial(string start, string end, SellingOrder sellingOrder)
    {
        if (!int.TryParse(start, out var startNo) || !int.TryParse(end, out var endNo))
        {
            throw new AppException(ErrorCodes.InvalidSerialRange, "Serial numbers must be numeric.");
        }

        return sellingOrder == SellingOrder.Descending
            ? startNo >= endNo ? start : end
            : startNo <= endNo ? start : end;
    }

    private static string NormalizeGameCode(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        return Regex.Replace(value, @"[^0-9A-Za-z]", string.Empty).Trim().ToUpperInvariant();
    }

    private static string NormalizePackComponent(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        return Regex.Replace(value, @"[^0-9A-Za-z]", string.Empty).Trim().ToUpperInvariant();
    }

    private static (string GameCode, string PackNumber) TryParseCodeAndPackFromRaw(string? rawText)
    {
        if (string.IsNullOrWhiteSpace(rawText))
        {
            return (string.Empty, string.Empty);
        }

        var match = CodeAndPackRegex.Match(rawText);
        if (!match.Success)
        {
            return (string.Empty, string.Empty);
        }

        return (
            NormalizeGameCode(match.Groups["game"].Value),
            NormalizePackComponent(match.Groups["pack"].Value));
    }

    private static string BuildCompositePackNumber(string gameCode, string packComponent)
        => $"{NormalizeGameCode(gameCode)}-{NormalizePackComponent(packComponent)}";

    private static string NormalizePackNumberForGame(string rawPackNumber, string normalizedGameCode)
    {
        var parsed = TryParseCodeAndPackFromRaw(rawPackNumber);
        var packComponent = !string.IsNullOrWhiteSpace(parsed.PackNumber)
            ? parsed.PackNumber
            : NormalizePackComponent(rawPackNumber);

        if (string.IsNullOrWhiteSpace(packComponent))
        {
            throw new AppException("invalid_pack_number", "Pack number is invalid.");
        }

        return BuildCompositePackNumber(normalizedGameCode, packComponent);
    }
}
