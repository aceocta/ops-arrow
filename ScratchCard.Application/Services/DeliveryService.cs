using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Deliveries;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Entities;
using ScratchCard.Domain.Enums;
using System.Globalization;
using System.Text.RegularExpressions;

namespace ScratchCard.Application.Services;

public class DeliveryService : IDeliveryService
{
    private static readonly Regex CodeAndPackRegex = new(
        @"(?<game>[0-9A-Za-z]{2,20})\s*[-]\s*(?<pack>[0-9A-Za-z]{3,16})",
        RegexOptions.Compiled);
    private static readonly Regex GameCodeRegex = new("^[0-9A-Z]{2,20}$", RegexOptions.Compiled);

    private readonly IRepository<Delivery> _deliveryRepository;
    private readonly IRepository<ScratchCardPack> _packRepository;
    private readonly IRepository<ScratchCardGame> _masterGameRepository;
    private readonly IRepository<ShopScratchCardGame> _shopGameRepository;
    private readonly IRepository<DeliveryPack> _deliveryPackRepository;
    private readonly IShopConfigurationService _shopConfigurationService;
    private readonly IDeliveryNoteAiParser _deliveryNoteAiParser;
    private readonly IAuditService _auditService;
    private readonly ICurrentUserService _currentUserService;
    private readonly IUnitOfWork _unitOfWork;

    public DeliveryService(
        IRepository<Delivery> deliveryRepository,
        IRepository<ScratchCardPack> packRepository,
        IRepository<ScratchCardGame> masterGameRepository,
        IRepository<ShopScratchCardGame> shopGameRepository,
        IRepository<DeliveryPack> deliveryPackRepository,
        IShopConfigurationService shopConfigurationService,
        IDeliveryNoteAiParser deliveryNoteAiParser,
        IAuditService auditService,
        ICurrentUserService currentUserService,
        IUnitOfWork unitOfWork)
    {
        _deliveryRepository = deliveryRepository;
        _packRepository = packRepository;
        _masterGameRepository = masterGameRepository;
        _shopGameRepository = shopGameRepository;
        _deliveryPackRepository = deliveryPackRepository;
        _shopConfigurationService = shopConfigurationService;
        _deliveryNoteAiParser = deliveryNoteAiParser;
        _auditService = auditService;
        _currentUserService = currentUserService;
        _unitOfWork = unitOfWork;
    }

    public async Task<DeliveryDto> CreateAsync(CreateDeliveryRequest request, CancellationToken cancellationToken = default)
    {
        var packSetup = await _shopConfigurationService.GetPackSetupAsync(request.ShopId, cancellationToken);

        var shopGames = await _shopGameRepository.Query()
            .Where(x => x.ShopId == request.ShopId && !x.IsDeleted)
            .Include(x => x.MasterGame)
            .ToListAsync(cancellationToken);

        var gamesById = shopGames.ToDictionary(x => x.Id, x => x);
        var gamesByCode = shopGames
            .GroupBy(x => NormalizeGameCode(x.MasterGame.GameCode))
            .ToDictionary(x => x.Key, x => x.First(), StringComparer.OrdinalIgnoreCase);
        var masterGames = await _masterGameRepository.Query()
            .Where(x => x.IsActive && !x.IsDeleted)
            .ToListAsync(cancellationToken);
        var masterGamesByCode = masterGames
            .GroupBy(x => NormalizeGameCode(x.GameCode))
            .ToDictionary(x => x.Key, x => x.First(), StringComparer.OrdinalIgnoreCase);

        var resolvedRows = new List<(CreateDeliveryPackRequest PackRequest, ShopScratchCardGame ShopGame, string NormalizedPackNumber)>();
        var createdMasterGames = new List<ScratchCardGame>();
        var createdShopGames = new List<ShopScratchCardGame>();

        foreach (var packRequest in request.Packs)
        {
            ShopScratchCardGame resolvedGame;

            if (packRequest.GameId.HasValue && packRequest.GameId.Value != Guid.Empty)
            {
                if (!gamesById.TryGetValue(packRequest.GameId.Value, out resolvedGame!))
                {
                    throw new AppException("invalid_game", "One or more games are invalid or inactive.");
                }

                if (!resolvedGame.IsActive || !resolvedGame.MasterGame.IsActive)
                {
                    throw new AppException("invalid_game", "One or more games are invalid or inactive.");
                }
            }
            else
            {
                var normalizedCode = NormalizeGameCode(packRequest.GameCode);
                if (string.IsNullOrWhiteSpace(normalizedCode))
                {
                    throw new AppException("invalid_game", "Game code is required when game is not selected.");
                }
                ValidateGameCode(normalizedCode);

                if (gamesByCode.TryGetValue(normalizedCode, out resolvedGame!))
                {
                    if (!resolvedGame.IsActive)
                    {
                        resolvedGame.IsActive = true;
                        resolvedGame.ModifiedOn = DateTimeOffset.UtcNow;
                        resolvedGame.ModifiedBy = _currentUserService.UserId;
                    }
                }
                else
                {
                    if (!request.AllowAutoCreateGames)
                    {
                        throw new AppException(
                            ErrorCodes.GameNotInCatalog,
                            $"Game code '{normalizedCode}' is not assigned to this shop. Create/assign from catalog first.",
                            400);
                    }

                    if (!masterGamesByCode.TryGetValue(normalizedCode, out var masterGame))
                    {
                        masterGame = new ScratchCardGame
                        {
                            GameCode = normalizedCode,
                            GameName = string.IsNullOrWhiteSpace(packRequest.GameName)
                                ? $"Game {normalizedCode}"
                                : packRequest.GameName.Trim(),
                            TicketPrice = packRequest.TicketPrice,
                            TicketsPerPack = Math.Max(packRequest.TotalTickets, 1),
                            IsActive = true,
                            CreatedOn = DateTimeOffset.UtcNow,
                            CreatedBy = _currentUserService.UserId
                        };

                        await _masterGameRepository.AddAsync(masterGame, cancellationToken);
                        masterGamesByCode[normalizedCode] = masterGame;
                        createdMasterGames.Add(masterGame);
                    }

                    resolvedGame = new ShopScratchCardGame
                    {
                        ShopId = request.ShopId,
                        MasterGame = masterGame,
                        MasterGameId = masterGame.Id,
                        IsActive = true,
                        DefaultStartSerialNumber = string.IsNullOrWhiteSpace(packRequest.StartSerialNumber) ? "000" : packRequest.StartSerialNumber.Trim(),
                        DefaultEndSerialNumber = string.IsNullOrWhiteSpace(packRequest.EndSerialNumber) ? "099" : packRequest.EndSerialNumber.Trim(),
                        DefaultSellingOrder = packSetup.SellingOrder,
                        CreatedOn = DateTimeOffset.UtcNow,
                        CreatedBy = _currentUserService.UserId
                    };

                    await _shopGameRepository.AddAsync(resolvedGame, cancellationToken);
                    gamesById[resolvedGame.Id] = resolvedGame;
                    gamesByCode[normalizedCode] = resolvedGame;
                    createdShopGames.Add(resolvedGame);
                }
            }

            var normalizedPackNumber = NormalizePackNumberForGame(packRequest.PackNumber, NormalizeGameCode(resolvedGame.MasterGame.GameCode));
            resolvedRows.Add((packRequest, resolvedGame, normalizedPackNumber));
        }

        var duplicateInRequest = resolvedRows
            .GroupBy(x => x.NormalizedPackNumber, StringComparer.OrdinalIgnoreCase)
            .Any(x => x.Count() > 1);
        if (duplicateInRequest)
        {
            throw new AppException(ErrorCodes.DuplicatePackNumber, "Duplicate pack numbers are not allowed within a delivery.");
        }

        var packNumbers = resolvedRows.Select(x => x.NormalizedPackNumber).ToArray();
        var duplicateExists = await _packRepository.Query()
            .AnyAsync(x => x.ShopId == request.ShopId && packNumbers.Contains(x.PackNumber) && !x.IsDeleted, cancellationToken);

        if (duplicateExists)
        {
            throw new AppException(ErrorCodes.DuplicatePackNumber, "Pack number must be unique per shop.");
        }

        var delivery = new Delivery
        {
            ShopId = request.ShopId,
            DeliveryDate = request.DeliveryDate,
            SupplierName = request.SupplierName,
            DeliveryReference = request.DeliveryReference,
            ReceivedByUserId = request.ReceivedByUserId,
            Notes = request.Notes,
            CreatedOn = DateTimeOffset.UtcNow,
            CreatedBy = _currentUserService.UserId
        };

        await _deliveryRepository.AddAsync(delivery, cancellationToken);

        var createdPacks = new List<ScratchCardPack>();
        foreach (var row in resolvedRows)
        {
            var packRequest = row.PackRequest;
            var pack = new ScratchCardPack
            {
                ShopId = request.ShopId,
                GameId = row.ShopGame.MasterGameId,
                PackNumber = row.NormalizedPackNumber,
                DisplayNumber = packRequest.DisplayNumber,
                TicketPrice = packRequest.TicketPrice,
                TotalTickets = packRequest.TotalTickets,
                StartSerialNumber = packRequest.StartSerialNumber,
                EndSerialNumber = packRequest.EndSerialNumber,
                SellingOrder = packSetup.SellingOrder,
                CurrentSerialNumber = GetDefaultOpeningSerial(packRequest.StartSerialNumber, packRequest.EndSerialNumber, packSetup.SellingOrder),
                Status = PackStatus.InStock,
                IsManuallyAdded = false,
                ReceivedDate = request.DeliveryDate,
                Notes = packRequest.Notes,
                CreatedOn = DateTimeOffset.UtcNow,
                CreatedBy = _currentUserService.UserId
            };

            createdPacks.Add(pack);
        }

        await _packRepository.AddRangeAsync(createdPacks, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        foreach (var pack in createdPacks)
        {
            await _deliveryPackRepository.AddAsync(new DeliveryPack
            {
                DeliveryId = delivery.Id,
                ScratchCardPackId = pack.Id
            }, cancellationToken);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        foreach (var game in createdMasterGames)
        {
            await _auditService.LogAsync(nameof(ScratchCardGame), game.Id, "MasterGameCreatedFromDelivery", request.ShopId, cancellationToken: cancellationToken);
        }

        foreach (var game in createdShopGames)
        {
            await _auditService.LogAsync(nameof(ShopScratchCardGame), game.Id, "MasterGameAssignedToShopFromDelivery", request.ShopId, cancellationToken: cancellationToken);
        }

        await _auditService.LogAsync(nameof(Delivery), delivery.Id, "DeliveryCreated", delivery.ShopId, cancellationToken: cancellationToken);

        return await GetAsync(delivery.Id, cancellationToken);
    }

    public async Task<ParseDeliveryNoteResponse> ParseDeliveryNoteAsync(ParseDeliveryNoteRequest request, CancellationToken cancellationToken = default)
    {
        if (request.ImageBytes.Length == 0)
        {
            throw new AppException(ErrorCodes.DeliveryNoteImageRequired, "Image is required to parse delivery note.");
        }

        var packSetup = await _shopConfigurationService.GetPackSetupAsync(request.ShopId, cancellationToken);

        var aiResult = await _deliveryNoteAiParser.ParseAsync(
            request.ImageBytes,
            request.ContentType,
            request.FileName,
            cancellationToken);

        var activeGames = await _shopGameRepository.Query()
            .Where(x => x.ShopId == request.ShopId && x.IsActive && !x.IsDeleted)
            .Include(x => x.MasterGame)
            .AsNoTracking()
            .ToListAsync(cancellationToken);
        var activeMasterGames = await _masterGameRepository.Query()
            .AsNoTracking()
            .Where(x => x.IsActive && !x.IsDeleted)
            .ToListAsync(cancellationToken);

        var gamesByCode = activeGames
            .GroupBy(x => NormalizeGameCode(x.MasterGame.GameCode))
            .ToDictionary(x => x.Key, x => x.First(), StringComparer.OrdinalIgnoreCase);
        var masterGamesByCode = activeMasterGames
            .GroupBy(x => NormalizeGameCode(x.GameCode))
            .ToDictionary(x => x.Key, x => x.First(), StringComparer.OrdinalIgnoreCase);

        var suggestions = new List<DeliveryNotePackSuggestionDto>();
        var warnings = new List<string>();
        var imagePackNumbers = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var pair in aiResult.Pairs)
        {
            var gameCode = NormalizeGameCode(pair.GameCode);
            var pairPack = TryParseCodeAndPackFromRaw(pair.PackNumber);
            if (string.IsNullOrWhiteSpace(gameCode))
            {
                gameCode = pairPack.GameCode;
            }

            var packNumber = pairPack.PackNumber;
            if (string.IsNullOrWhiteSpace(packNumber))
            {
                packNumber = NormalizePackComponent(pair.PackNumber);
            }

            if (string.IsNullOrWhiteSpace(gameCode) || string.IsNullOrWhiteSpace(packNumber))
            {
                var fromRaw = TryParseCodeAndPackFromRaw(pair.RawText);
                gameCode = string.IsNullOrWhiteSpace(gameCode) ? fromRaw.GameCode : gameCode;
                packNumber = string.IsNullOrWhiteSpace(packNumber) ? fromRaw.PackNumber : packNumber;
            }

            if (string.IsNullOrWhiteSpace(gameCode) || string.IsNullOrWhiteSpace(packNumber))
            {
                if (!string.IsNullOrWhiteSpace(pair.RawText))
                {
                    warnings.Add($"Skipped unreadable entry: '{pair.RawText}'.");
                }

                continue;
            }

            var compositePackNumber = BuildCompositePackNumber(gameCode, packNumber);
            var suggestion = new DeliveryNotePackSuggestionDto
            {
                GameCode = gameCode,
                PackNumber = compositePackNumber,
                RawText = pair.RawText,
                Confidence = pair.Confidence
            };

            if (!imagePackNumbers.Add(compositePackNumber))
            {
                suggestion.IsDuplicateInImage = true;
                warnings.Add($"Duplicate pack number '{compositePackNumber}' was detected in the scanned image.");
            }

            if (gamesByCode.TryGetValue(gameCode, out var game))
            {
                suggestion.GameId = game.Id;
                suggestion.GameName = game.MasterGame.GameName;
                suggestion.TicketPrice = game.MasterGame.TicketPrice;
                suggestion.TotalTickets = game.MasterGame.TicketsPerPack;
                suggestion.StartSerialNumber = game.DefaultStartSerialNumber;
                suggestion.EndSerialNumber = game.DefaultEndSerialNumber;
                suggestion.SellingOrder = packSetup.SellingOrder;
            }
            else
            {
                suggestion.IsNewGameCandidate = true;
                suggestion.GameName = string.IsNullOrWhiteSpace(pair.GameName) ? $"Game {gameCode}" : pair.GameName.Trim();
                suggestion.TicketPrice = pair.PricePoint ?? 0;
                suggestion.TotalTickets = 100;
                suggestion.StartSerialNumber = "00";
                suggestion.EndSerialNumber = "99";
                suggestion.SellingOrder = packSetup.SellingOrder;

                if (masterGamesByCode.ContainsKey(gameCode))
                {
                    warnings.Add($"Game code '{gameCode}' exists in master catalog but is not assigned to this shop. It can be assigned during save.");
                }
                else
                {
                    warnings.Add($"Game code '{gameCode}' does not exist in master catalog. It can be created and assigned during save.");
                }
                if ((suggestion.TicketPrice ?? 0) <= 0)
                {
                    warnings.Add($"Price was not detected for game '{gameCode}'. Please enter ticket price before save.");
                }
            }

            suggestions.Add(suggestion);
        }

        if (suggestions.Count == 0)
        {
            warnings.Add("No game and pack pairs were extracted from the image. Please add pack rows manually.");
        }

        var suggestedPackNumbers = suggestions
            .Select(x => x.PackNumber)
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        if (suggestedPackNumbers.Length > 0)
        {
            var existingNumbers = await _packRepository.Query()
                .AsNoTracking()
                .Where(x => x.ShopId == request.ShopId && suggestedPackNumbers.Contains(x.PackNumber) && !x.IsDeleted)
                .Select(x => x.PackNumber)
                .ToListAsync(cancellationToken);

            var existingLookup = existingNumbers.ToHashSet(StringComparer.OrdinalIgnoreCase);
            foreach (var suggestion in suggestions)
            {
                if (!existingLookup.Contains(suggestion.PackNumber))
                {
                    continue;
                }

                suggestion.ExistsInSystem = true;
                warnings.Add($"Pack number '{suggestion.PackNumber}' already exists in this shop.");
            }
        }

        var parsedDate = ParseDeliveryDate(aiResult.DeliveryDateText);
        if (parsedDate is null && !string.IsNullOrWhiteSpace(aiResult.DeliveryDateText))
        {
            warnings.Add($"Delivery date '{aiResult.DeliveryDateText}' could not be parsed. Using today's date.");
        }

        var resultDate = (parsedDate ?? DateOnly.FromDateTime(DateTime.UtcNow)).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

        return new ParseDeliveryNoteResponse
        {
            SupplierName = string.IsNullOrWhiteSpace(aiResult.SupplierName)
                ? "The National Lottery"
                : aiResult.SupplierName.Trim(),
            ShipmentNumber = aiResult.ShipmentNumber.Trim(),
            DeliveryReference = !string.IsNullOrWhiteSpace(aiResult.DeliveryReference)
                ? aiResult.DeliveryReference.Trim()
                : aiResult.ShipmentNumber.Trim(),
            DeliveryDate = resultDate,
            PackSuggestions = suggestions,
            Warnings = warnings.Distinct(StringComparer.OrdinalIgnoreCase).ToArray()
        };
    }

    public async Task<DeliveryDto> GetAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var delivery = await _deliveryRepository.Query()
            .AsNoTracking()
            .Include(x => x.DeliveryPacks)
                .ThenInclude(x => x.ScratchCardPack)
                    .ThenInclude(x => x.Game)
            .FirstOrDefaultAsync(x => x.Id == id, cancellationToken)
            ?? throw new AppException("delivery_not_found", "Delivery not found.", 404);

        return delivery.ToDto();
    }

    public async Task<IReadOnlyCollection<DeliveryDto>> ListAsync(Guid shopId, CancellationToken cancellationToken = default)
    {
        var deliveries = await _deliveryRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId)
            .Include(x => x.DeliveryPacks)
                .ThenInclude(x => x.ScratchCardPack)
                    .ThenInclude(x => x.Game)
            .OrderByDescending(x => x.DeliveryDate)
            .ToListAsync(cancellationToken);

        return deliveries.Select(x => x.ToDto()).ToArray();
    }

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

    private static DateOnly? ParseDeliveryDate(string? dateText)
    {
        if (string.IsNullOrWhiteSpace(dateText))
        {
            return null;
        }

        var culture = CultureInfo.GetCultureInfo("en-GB");
        var styles = DateTimeStyles.AllowWhiteSpaces | DateTimeStyles.AssumeLocal;

        if (DateTimeOffset.TryParse(dateText, culture, styles, out var dateTimeOffset))
        {
            return DateOnly.FromDateTime(dateTimeOffset.LocalDateTime);
        }

        if (DateTime.TryParse(dateText, culture, styles, out var dateTime))
        {
            return DateOnly.FromDateTime(dateTime);
        }

        var formats = new[]
        {
            "dd/MM/yyyy HH:mm",
            "dd/MM/yyyy",
            "d/M/yyyy HH:mm",
            "d/M/yyyy",
            "yyyy-MM-dd"
        };

        foreach (var format in formats)
        {
            if (DateTime.TryParseExact(dateText, format, culture, styles, out var parsed))
            {
                return DateOnly.FromDateTime(parsed);
            }
        }

        return null;
    }

    private static string GetDefaultOpeningSerial(string start, string end, SellingOrder sellingOrder)
    {
        if (!int.TryParse(start, out var startNo) || !int.TryParse(end, out var endNo))
        {
            return start;
        }

        return sellingOrder == SellingOrder.Descending
            ? startNo >= endNo ? start : end
            : startNo <= endNo ? start : end;
    }
}
