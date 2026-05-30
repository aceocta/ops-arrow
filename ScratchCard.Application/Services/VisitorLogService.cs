using System.Text;
using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Models;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.VisitorLog;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Entities;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.Services;

public class VisitorLogService : IVisitorLogService
{
    private readonly IRepository<VisitorLogEntry> _entryRepository;
    private readonly IRepository<Visitor> _visitorRepository;
    private readonly IRepository<VisitorOrganisation> _organisationRepository;
    private readonly IRepository<Shop> _shopRepository;
    private readonly IRepository<ShopUser> _shopUserRepository;
    private readonly IFeatureGateService _featureGateService;
    private readonly INotificationService _notificationService;
    private readonly IAuditService _auditService;
    private readonly ICurrentUserService _currentUserService;
    private readonly IUnitOfWork _unitOfWork;

    public VisitorLogService(
        IRepository<VisitorLogEntry> entryRepository,
        IRepository<Visitor> visitorRepository,
        IRepository<VisitorOrganisation> organisationRepository,
        IRepository<Shop> shopRepository,
        IRepository<ShopUser> shopUserRepository,
        IFeatureGateService featureGateService,
        INotificationService notificationService,
        IAuditService auditService,
        ICurrentUserService currentUserService,
        IUnitOfWork unitOfWork)
    {
        _entryRepository = entryRepository;
        _visitorRepository = visitorRepository;
        _organisationRepository = organisationRepository;
        _shopRepository = shopRepository;
        _shopUserRepository = shopUserRepository;
        _featureGateService = featureGateService;
        _notificationService = notificationService;
        _auditService = auditService;
        _currentUserService = currentUserService;
        _unitOfWork = unitOfWork;
    }

    public async Task<VisitorLogEntryDto> CreateEntryAsync(CreateVisitorLogEntryRequest request, CancellationToken cancellationToken = default)
    {
        if (request.VisitDate == default)
        {
            throw new AppException("visitor_invalid_date", "Visit date is required.");
        }

        var name = request.VisitorName?.Trim() ?? string.Empty;
        if (name.Length == 0)
        {
            throw new AppException("visitor_name_required", "Visitor name is required.");
        }

        var visitType = NormalizeVisitType(request.VisitType);

        var shop = await _shopRepository.Query().AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == request.ShopId, cancellationToken)
            ?? throw new AppException("shop_not_found", "Shop not found.", 404);

        var now = DateTimeOffset.UtcNow;
        var nextSequence = await _entryRepository.Query().AsNoTracking()
            .Where(x => x.ShopId == request.ShopId && x.VisitDate == request.VisitDate)
            .Select(x => (int?)x.SequenceNo)
            .MaxAsync(cancellationToken) ?? 0;

        // Signature is required on every plan.
        var signaturePath = await SaveImageAsync(request.SignatureDataUrl, request.ShopId, request.VisitDate, "signatures", "signature", cancellationToken);

        // Photo is optional and only stored when the plan includes the attachments feature.
        string? photoPath = null;
        if (!string.IsNullOrWhiteSpace(request.PhotoDataUrl)
            && await _featureGateService.HasFeatureAsync(request.ShopId, FeatureKeys.VisitorLogAttachments, cancellationToken))
        {
            photoPath = await SaveImageAsync(request.PhotoDataUrl!, request.ShopId, request.VisitDate, "photos", "photo", cancellationToken);
        }

        // Canonicalise the company name against the shared platform directory so spelling stays
        // consistent everywhere, and add it to the directory if it's new.
        var canonicalOrg = await ResolveOrCreateOrganisationAsync(request.Organisation, now, cancellationToken);

        var visitor = await ResolveOrCreateDirectoryAsync(shop.CompanyId, name, canonicalOrg, visitType, now, cancellationToken);

        var entry = new VisitorLogEntry
        {
            ShopId = request.ShopId,
            VisitorId = visitor?.Id,
            SequenceNo = nextSequence + 1,
            VisitDate = request.VisitDate,
            TimeIn = request.TimeIn,
            TimeOut = null,
            VisitorName = name,
            Organisation = canonicalOrg,
            VisitType = visitType,
            Purpose = Clean(request.Purpose),
            HostName = Clean(request.HostName),
            VehicleRegistration = Clean(request.VehicleRegistration)?.ToUpperInvariant(),
            IsInspector = VisitorVisitType.IsInspector(visitType),
            SignatureImagePath = signaturePath,
            PhotoImagePath = photoPath,
            Notes = Clean(request.Notes),
            // Forecourt-only controls are dropped for non-fuel shops.
            SpaPassportRef = shop.IsFuelStation ? Clean(request.SpaPassportRef) : null,
            PermitToWorkRef = shop.IsFuelStation ? Clean(request.PermitToWorkRef) : null,
            InductionAcknowledged = shop.IsFuelStation && request.InductionAcknowledged,
            RecordedOn = now,
            RecordedByUserId = _currentUserService.UserId,
            RecordedByName = _currentUserService.FullName,
            CreatedOn = now,
            CreatedBy = _currentUserService.UserId
        };

        await _entryRepository.AddAsync(entry, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(
            nameof(VisitorLogEntry),
            entry.Id,
            "VisitorSignedIn",
            entry.ShopId,
            newValue: $"{entry.VisitorName} ({entry.VisitType})",
            cancellationToken: cancellationToken);

        if (entry.IsInspector)
        {
            await TrySendInspectorAlertAsync(shop, entry, cancellationToken);
        }

        return entry.ToDto();
    }

    public async Task<VisitorLogEntryDto> GetEntryAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var entry = await _entryRepository.Query().AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == id, cancellationToken)
            ?? throw new AppException("visitor_entry_not_found", "Visitor entry not found.", 404);
        return entry.ToDto();
    }

    public async Task<VisitorLogEntryDto> UpdateEntryAsync(Guid id, UpdateVisitorLogEntryRequest request, CancellationToken cancellationToken = default)
    {
        var entry = await _entryRepository.Query()
            .FirstOrDefaultAsync(x => x.Id == id, cancellationToken)
            ?? throw new AppException("visitor_entry_not_found", "Visitor entry not found.", 404);

        var shop = await _shopRepository.Query().AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == entry.ShopId, cancellationToken)
            ?? throw new AppException("shop_not_found", "Shop not found.", 404);

        var visitType = NormalizeVisitType(request.VisitType);
        entry.TimeIn = request.TimeIn;
        entry.TimeOut = request.TimeOut;
        entry.VisitorName = (request.VisitorName?.Trim() is { Length: > 0 } n) ? n : entry.VisitorName;
        entry.Organisation = await ResolveOrCreateOrganisationAsync(request.Organisation, DateTimeOffset.UtcNow, cancellationToken);
        entry.VisitType = visitType;
        entry.IsInspector = VisitorVisitType.IsInspector(visitType);
        entry.Purpose = Clean(request.Purpose);
        entry.HostName = Clean(request.HostName);
        entry.VehicleRegistration = Clean(request.VehicleRegistration)?.ToUpperInvariant();
        entry.Notes = Clean(request.Notes);
        entry.SpaPassportRef = shop.IsFuelStation ? Clean(request.SpaPassportRef) : null;
        entry.PermitToWorkRef = shop.IsFuelStation ? Clean(request.PermitToWorkRef) : null;
        entry.InductionAcknowledged = shop.IsFuelStation && request.InductionAcknowledged;
        entry.ModifiedOn = DateTimeOffset.UtcNow;
        entry.ModifiedBy = _currentUserService.UserId;

        if (!string.IsNullOrWhiteSpace(request.SignatureDataUrl))
        {
            var path = await SaveImageAsync(request.SignatureDataUrl!, entry.ShopId, entry.VisitDate, "signatures", "signature", cancellationToken);
            TryDeleteImage(entry.SignatureImagePath);
            entry.SignatureImagePath = path;
        }

        if (!string.IsNullOrWhiteSpace(request.PhotoDataUrl)
            && await _featureGateService.HasFeatureAsync(entry.ShopId, FeatureKeys.VisitorLogAttachments, cancellationToken))
        {
            var path = await SaveImageAsync(request.PhotoDataUrl!, entry.ShopId, entry.VisitDate, "photos", "photo", cancellationToken);
            TryDeleteImage(entry.PhotoImagePath);
            entry.PhotoImagePath = path;
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        await _auditService.LogAsync(nameof(VisitorLogEntry), entry.Id, "VisitorEntryUpdated", entry.ShopId, cancellationToken: cancellationToken);
        return entry.ToDto();
    }

    public async Task<VisitorLogEntryDto> SignOutAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var entry = await _entryRepository.Query()
            .FirstOrDefaultAsync(x => x.Id == id, cancellationToken)
            ?? throw new AppException("visitor_entry_not_found", "Visitor entry not found.", 404);

        if (entry.TimeOut is null)
        {
            entry.TimeOut = TimeOnly.FromDateTime(DateTime.Now);
            entry.ModifiedOn = DateTimeOffset.UtcNow;
            entry.ModifiedBy = _currentUserService.UserId;
            await _unitOfWork.SaveChangesAsync(cancellationToken);
            await _auditService.LogAsync(nameof(VisitorLogEntry), entry.Id, "VisitorSignedOut", entry.ShopId, cancellationToken: cancellationToken);
        }

        return entry.ToDto();
    }

    public async Task<IReadOnlyCollection<VisitorLogEntryDto>> ListEntriesAsync(Guid shopId, DateOnly date, CancellationToken cancellationToken = default)
    {
        var entries = await _entryRepository.Query().AsNoTracking()
            .Where(x => x.ShopId == shopId && x.VisitDate == date)
            .OrderBy(x => x.SequenceNo)
            .ToListAsync(cancellationToken);
        return entries.Select(x => x.ToDto()).ToArray();
    }

    public async Task<IReadOnlyCollection<VisitorLogEntryDto>> ListEntriesByRangeAsync(Guid shopId, DateOnly from, DateOnly to, CancellationToken cancellationToken = default)
    {
        var entries = await _entryRepository.Query().AsNoTracking()
            .Where(x => x.ShopId == shopId && x.VisitDate >= from && x.VisitDate <= to)
            .OrderByDescending(x => x.VisitDate).ThenBy(x => x.SequenceNo)
            .ToListAsync(cancellationToken);
        return entries.Select(x => x.ToDto()).ToArray();
    }

    public async Task<IReadOnlyCollection<VisitorLogEntryDto>> ListOnSiteAsync(Guid shopId, CancellationToken cancellationToken = default)
    {
        // The live evacuation roll call — everyone signed in but not yet signed out.
        var entries = await _entryRepository.Query().AsNoTracking()
            .Where(x => x.ShopId == shopId && x.TimeOut == null)
            .OrderBy(x => x.VisitDate).ThenBy(x => x.TimeIn)
            .ToListAsync(cancellationToken);
        return entries.Select(x => x.ToDto()).ToArray();
    }

    public async Task<VisitorLogDailyLogDto> GetDailyLogAsync(Guid shopId, DateOnly date, CancellationToken cancellationToken = default)
    {
        var entries = await ListEntriesAsync(shopId, date, cancellationToken);
        return new VisitorLogDailyLogDto
        {
            ShopId = shopId,
            Date = date,
            OnSiteCount = entries.Count(x => x.IsOnSite),
            Entries = entries
        };
    }

    public async Task<IReadOnlyCollection<VisitorDirectoryDto>> SearchDirectoryAsync(Guid shopId, string query, CancellationToken cancellationToken = default)
    {
        var term = query?.Trim() ?? string.Empty;
        if (term.Length < 2)
        {
            return Array.Empty<VisitorDirectoryDto>();
        }

        var companyId = await _shopRepository.Query().AsNoTracking()
            .Where(x => x.Id == shopId).Select(x => x.CompanyId).FirstOrDefaultAsync(cancellationToken);

        var matches = await _visitorRepository.Query().AsNoTracking()
            .Where(x => x.CompanyId == companyId
                && (EF.Functions.Like(x.FullName, $"%{term}%")
                    || (x.Organisation != null && EF.Functions.Like(x.Organisation, $"%{term}%"))))
            .OrderByDescending(x => x.LastVisitedOn)
            .Take(10)
            .ToListAsync(cancellationToken);

        return matches.Select(x => x.ToDirectoryDto()).ToArray();
    }

    public async Task<IReadOnlyCollection<VisitorOrganisationDto>> SearchOrganisationsAsync(string query, CancellationToken cancellationToken = default)
    {
        var term = query?.Trim() ?? string.Empty;
        if (term.Length < 2)
        {
            return Array.Empty<VisitorOrganisationDto>();
        }

        // Platform-wide search — most-used names first so common suppliers surface at the top.
        var matches = await _organisationRepository.Query().AsNoTracking()
            .Where(x => EF.Functions.Like(x.Name, $"%{term}%"))
            .OrderByDescending(x => x.UsageCount)
            .ThenBy(x => x.Name)
            .Take(10)
            .ToListAsync(cancellationToken);

        return matches.Select(x => new VisitorOrganisationDto { Id = x.Id, Name = x.Name, UsageCount = x.UsageCount }).ToArray();
    }

    private async Task<string?> ResolveOrCreateOrganisationAsync(string? rawName, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var name = Clean(rawName);
        if (name is null)
        {
            return null;
        }

        var normalized = NormalizeOrganisation(name);
        var existing = await _organisationRepository.Query()
            .FirstOrDefaultAsync(x => x.NormalizedName == normalized, cancellationToken);

        if (existing is not null)
        {
            existing.UsageCount += 1;
            existing.LastUsedOn = now;
            existing.ModifiedOn = now;
            existing.ModifiedBy = _currentUserService.UserId;
            // Return the canonical stored spelling so every log uses the same form.
            return existing.Name;
        }

        var created = new VisitorOrganisation
        {
            Name = name,
            NormalizedName = normalized,
            UsageCount = 1,
            LastUsedOn = now,
            CreatedOn = now,
            CreatedBy = _currentUserService.UserId
        };
        await _organisationRepository.AddAsync(created, cancellationToken);
        return created.Name;
    }

    private static string NormalizeOrganisation(string name)
    {
        var collapsed = string.Join(' ', name.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
        return collapsed.ToLowerInvariant();
    }

    public async Task<string?> GetEntrySignatureDataUrlAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var entry = await _entryRepository.Query().AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, cancellationToken)
            ?? throw new AppException("visitor_entry_not_found", "Visitor entry not found.", 404);
        return await ReadImageDataUrlAsync(entry.SignatureImagePath, cancellationToken);
    }

    public async Task<string?> GetEntryPhotoDataUrlAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var entry = await _entryRepository.Query().AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, cancellationToken)
            ?? throw new AppException("visitor_entry_not_found", "Visitor entry not found.", 404);
        return await ReadImageDataUrlAsync(entry.PhotoImagePath, cancellationToken);
    }

    private async Task<Visitor?> ResolveOrCreateDirectoryAsync(Guid? companyId, string name, string? organisation, string visitType, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var normalized = name.Trim().ToLowerInvariant();
        var org = Clean(organisation);

        var existing = await _visitorRepository.Query()
            .Where(x => x.CompanyId == companyId && x.FullName.ToLower() == normalized)
            .FirstOrDefaultAsync(cancellationToken);

        if (existing is not null)
        {
            existing.VisitCount += 1;
            existing.LastVisitedOn = now;
            if (!string.IsNullOrWhiteSpace(org)) existing.Organisation = org;
            existing.DefaultVisitType = visitType;
            existing.ModifiedOn = now;
            existing.ModifiedBy = _currentUserService.UserId;
            return existing;
        }

        var created = new Visitor
        {
            CompanyId = companyId,
            FullName = name.Trim(),
            Organisation = org,
            DefaultVisitType = visitType,
            VisitCount = 1,
            LastVisitedOn = now,
            CreatedOn = now,
            CreatedBy = _currentUserService.UserId
        };
        await _visitorRepository.AddAsync(created, cancellationToken);
        return created;
    }

    private async Task TrySendInspectorAlertAsync(Shop shop, VisitorLogEntry entry, CancellationToken cancellationToken)
    {
        try
        {
            if (!await _featureGateService.HasFeatureAsync(shop.Id, FeatureKeys.VisitorLogInspectorAlerts, cancellationToken))
            {
                return;
            }

            var recipients = await _shopUserRepository.Query().AsNoTracking()
                .Where(x => x.ShopId == shop.Id && x.IsActive
                    && (x.Role.Name == RoleNames.CompanyOwner || x.Role.Name == RoleNames.Manager))
                .Include(x => x.Role).Include(x => x.User)
                .Select(x => x.User.Email).Distinct()
                .ToListAsync(cancellationToken);

            var body = new StringBuilder();
            body.AppendLine($"An inspector has signed in at {shop.ShopName}.");
            body.AppendLine();
            body.AppendLine($"Name: {entry.VisitorName}");
            if (!string.IsNullOrWhiteSpace(entry.Organisation)) body.AppendLine($"Organisation: {entry.Organisation}");
            body.AppendLine($"Time in: {entry.VisitDate:yyyy-MM-dd} {entry.TimeIn:HH\\:mm}");
            if (!string.IsNullOrWhiteSpace(entry.Purpose)) body.AppendLine($"Purpose: {entry.Purpose}");

            foreach (var recipient in recipients)
            {
                try
                {
                    await _notificationService.SendAsync(new NotificationMessage
                    {
                        ShopId = shop.Id,
                        NotificationType = NotificationType.VisitorInspectorArrival,
                        Channel = NotificationChannel.Email,
                        Recipient = recipient,
                        Subject = $"Inspector on site - {shop.ShopName}",
                        Body = body.ToString(),
                        RelatedEntityName = nameof(VisitorLogEntry),
                        RelatedEntityId = entry.Id,
                        IsPriority = true
                    }, cancellationToken);
                }
                catch
                {
                    // Alert delivery must never block the sign-in.
                }
            }
        }
        catch
        {
            // Inspector alerts are best-effort.
        }
    }

    private static string NormalizeVisitType(string? value)
    {
        var trimmed = value?.Trim();
        if (string.IsNullOrEmpty(trimmed))
        {
            return VisitorVisitType.Other;
        }
        var match = VisitorVisitType.All.FirstOrDefault(x => string.Equals(x, trimmed, StringComparison.OrdinalIgnoreCase));
        return match ?? VisitorVisitType.Other;
    }

    private static string? Clean(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrEmpty(trimmed) ? null : trimmed;
    }

    private static async Task<string> SaveImageAsync(string dataUrl, Guid shopId, DateOnly date, string sectionFolder, string filePrefix, CancellationToken cancellationToken)
    {
        var (bytes, ext) = ParseImage(dataUrl);
        var projectRoot = ResolveProjectRootPath();
        var folderPath = Path.Combine(projectRoot, "SignatureUploads", "VisitorLog", sectionFolder, shopId.ToString("N"), date.ToString("yyyyMMdd"));
        Directory.CreateDirectory(folderPath);
        var fileName = $"{filePrefix}-{DateTime.UtcNow:yyyyMMddHHmmssfff}-{Guid.NewGuid():N}.{ext}";
        var fullPath = Path.Combine(folderPath, fileName);
        await File.WriteAllBytesAsync(fullPath, bytes, cancellationToken);
        return fullPath;
    }

    private static (byte[] Bytes, string Extension) ParseImage(string dataUrl)
    {
        if (string.IsNullOrWhiteSpace(dataUrl))
        {
            throw new AppException("visitor_signature_required", "Signature is required.");
        }

        var ext = dataUrl.Contains("image/jpeg", StringComparison.OrdinalIgnoreCase)
            || dataUrl.Contains("image/jpg", StringComparison.OrdinalIgnoreCase)
            ? "jpg" : "png";

        const string marker = "base64,";
        var markerIndex = dataUrl.IndexOf(marker, StringComparison.OrdinalIgnoreCase);
        var payload = (markerIndex >= 0 ? dataUrl[(markerIndex + marker.Length)..] : dataUrl).Trim();

        try
        {
            return (Convert.FromBase64String(payload), ext);
        }
        catch (FormatException)
        {
            throw new AppException("visitor_image_invalid", "Image format is invalid.");
        }
    }

    private static async Task<string?> ReadImageDataUrlAsync(string? imagePath, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(imagePath) || !File.Exists(imagePath))
        {
            return null;
        }
        var mime = imagePath.EndsWith(".jpg", StringComparison.OrdinalIgnoreCase) ? "image/jpeg" : "image/png";
        var bytes = await File.ReadAllBytesAsync(imagePath, cancellationToken);
        return $"data:{mime};base64,{Convert.ToBase64String(bytes)}";
    }

    private static void TryDeleteImage(string? imagePath)
    {
        if (string.IsNullOrWhiteSpace(imagePath)) return;
        try
        {
            if (File.Exists(imagePath)) File.Delete(imagePath);
        }
        catch
        {
            // ignore cleanup failures
        }
    }

    private static string ResolveProjectRootPath()
    {
        var current = new DirectoryInfo(Directory.GetCurrentDirectory());
        while (current is not null)
        {
            if (File.Exists(Path.Combine(current.FullName, "ScratchCard.slnx")))
            {
                return current.FullName;
            }
            current = current.Parent;
        }
        return Directory.GetCurrentDirectory();
    }
}
