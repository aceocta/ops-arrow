using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.RefusalRegister;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Entities;

namespace ScratchCard.Application.Services;

public class RefusalRegisterService : IRefusalRegisterService
{
    private readonly IRepository<RefusalRegisterEntry> _entryRepository;
    private readonly IRepository<RefusalRegisterDailySignoff> _signoffRepository;
    private readonly IAuditService _auditService;
    private readonly ICurrentUserService _currentUserService;
    private readonly IUnitOfWork _unitOfWork;

    public RefusalRegisterService(
        IRepository<RefusalRegisterEntry> entryRepository,
        IRepository<RefusalRegisterDailySignoff> signoffRepository,
        IAuditService auditService,
        ICurrentUserService currentUserService,
        IUnitOfWork unitOfWork)
    {
        _entryRepository = entryRepository;
        _signoffRepository = signoffRepository;
        _auditService = auditService;
        _currentUserService = currentUserService;
        _unitOfWork = unitOfWork;
    }

    public async Task<RefusalRegisterEntryDto> CreateEntryAsync(CreateRefusalRegisterEntryRequest request, CancellationToken cancellationToken = default)
    {
        if (request.RefusalDate == default)
        {
            throw new AppException("refusal_invalid_date", "Refusal date is required.");
        }

        var now = DateTimeOffset.UtcNow;
        var nextSequence = await _entryRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == request.ShopId && x.RefusalDate == request.RefusalDate)
            .Select(x => (int?)x.SequenceNo)
            .MaxAsync(cancellationToken) ?? 0;
        var signaturePath = await SaveSignatureImageAsync(request.SignatureDataUrl, request.ShopId, request.RefusalDate, "entries", cancellationToken);

        var entry = new RefusalRegisterEntry
        {
            ShopId = request.ShopId,
            SequenceNo = nextSequence + 1,
            RefusalDate = request.RefusalDate,
            RefusalTime = request.RefusalTime,
            Product = request.Product.Trim(),
            PersonDescription = request.PersonDescription.Trim(),
            Observations = request.Observations?.Trim(),
            StaffMemberInitials = BuildInitials(request.StaffMemberInitials, _currentUserService.FullName, _currentUserService.Email),
            SignatureImagePath = signaturePath,
            RecordedOn = now,
            RecordedByUserId = _currentUserService.UserId,
            RecordedByName = _currentUserService.FullName,
            CreatedOn = now,
            CreatedBy = _currentUserService.UserId
        };

        await _entryRepository.AddAsync(entry, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(
            nameof(RefusalRegisterEntry),
            entry.Id,
            "RefusalRegisterEntryCreated",
            entry.ShopId,
            cancellationToken: cancellationToken);

        return entry.ToDto();
    }

    public async Task<RefusalRegisterEntryDto> GetEntryAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var entry = await _entryRepository.Query()
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == id, cancellationToken)
            ?? throw new AppException("refusal_entry_not_found", "Refusal entry not found.", 404);

        return entry.ToDto();
    }

    public async Task<string?> GetEntrySignatureDataUrlAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var entry = await _entryRepository.Query()
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == id, cancellationToken)
            ?? throw new AppException("refusal_entry_not_found", "Refusal entry not found.", 404);

        return await ReadSignatureDataUrlAsync(entry.SignatureImagePath, cancellationToken);
    }

    public async Task<string?> GetEntryReviewSignatureDataUrlAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var entry = await _entryRepository.Query()
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == id, cancellationToken)
            ?? throw new AppException("refusal_entry_not_found", "Refusal entry not found.", 404);

        return await ReadSignatureDataUrlAsync(entry.ReviewSignatureImagePath, cancellationToken);
    }

    public async Task<RefusalRegisterEntryDto> UpdateEntryAsync(Guid id, UpdateRefusalRegisterEntryRequest request, CancellationToken cancellationToken = default)
    {
        var entry = await _entryRepository.Query()
            .FirstOrDefaultAsync(x => x.Id == id, cancellationToken)
            ?? throw new AppException("refusal_entry_not_found", "Refusal entry not found.", 404);

        entry.RefusalTime = request.RefusalTime;
        entry.Product = request.Product.Trim();
        entry.PersonDescription = request.PersonDescription.Trim();
        entry.Observations = request.Observations?.Trim();
        entry.StaffMemberInitials = BuildInitials(request.StaffMemberInitials, _currentUserService.FullName, _currentUserService.Email);

        if (!string.IsNullOrWhiteSpace(request.SignatureDataUrl))
        {
            var signaturePath = await SaveSignatureImageAsync(
                request.SignatureDataUrl,
                entry.ShopId,
                entry.RefusalDate,
                "entries",
                cancellationToken);
            TryDeleteSignatureImage(entry.SignatureImagePath);
            entry.SignatureImagePath = signaturePath;
        }

        entry.ModifiedOn = DateTimeOffset.UtcNow;
        entry.ModifiedBy = _currentUserService.UserId;

        _entryRepository.Update(entry);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(
            nameof(RefusalRegisterEntry),
            entry.Id,
            "RefusalRegisterEntryUpdated",
            entry.ShopId,
            cancellationToken: cancellationToken);

        return entry.ToDto();
    }

    public async Task<IReadOnlyCollection<RefusalRegisterEntryDto>> ListEntriesAsync(Guid shopId, DateOnly date, CancellationToken cancellationToken = default)
    {
        var entries = await _entryRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && x.RefusalDate == date)
            .OrderBy(x => x.SequenceNo)
            .ThenBy(x => x.RefusalTime)
            .ToListAsync(cancellationToken);

        return entries.Select(x => x.ToDto()).ToArray();
    }

    public async Task<IReadOnlyCollection<RefusalRegisterEntryDto>> ListEntriesByRangeAsync(Guid shopId, DateOnly from, DateOnly to, CancellationToken cancellationToken = default)
    {
        if (to < from)
        {
            throw new AppException("refusal_invalid_date_range", "To date must be the same or after from date.");
        }

        var entries = await _entryRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && x.RefusalDate >= from && x.RefusalDate <= to)
            .OrderByDescending(x => x.RefusalDate)
            .ThenBy(x => x.SequenceNo)
            .ToListAsync(cancellationToken);

        return entries.Select(x => x.ToDto()).ToArray();
    }

    public async Task<RefusalRegisterDailyLogDto> GetDailyLogAsync(Guid shopId, DateOnly date, CancellationToken cancellationToken = default)
    {
        var entries = await _entryRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && x.RefusalDate == date)
            .OrderBy(x => x.SequenceNo)
            .ThenBy(x => x.RefusalTime)
            .ToListAsync(cancellationToken);

        var signoff = await _signoffRepository.Query()
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.ShopId == shopId && x.SignoffDate == date, cancellationToken);

        return new RefusalRegisterDailyLogDto
        {
            ShopId = shopId,
            Date = date,
            Signoff = signoff?.ToDto(),
            Entries = entries.Select(x => x.ToDto()).ToArray()
        };
    }

    public async Task<RefusalRegisterEntryDto> ReviewEntryAsync(Guid id, ReviewRefusalRegisterEntryRequest request, CancellationToken cancellationToken = default)
    {
        if (!_currentUserService.IsInRole(RoleNames.ShopOwner) && !_currentUserService.IsInRole(RoleNames.Manager))
        {
            throw new AppException(ErrorCodes.UnauthorizedRole, "Only manager or shop owner can review refusal entries.", 403);
        }

        var entry = await _entryRepository.Query()
            .FirstOrDefaultAsync(x => x.Id == id, cancellationToken)
            ?? throw new AppException("refusal_entry_not_found", "Refusal entry not found.", 404);

        var reviewedByUserId = _currentUserService.UserId
            ?? throw new AppException("unauthorized", "Signed-in user is required.");
        await ApplyReviewAsync(entry, reviewedByUserId, request.Notes, request.SignatureDataUrl, cancellationToken);

        _entryRepository.Update(entry);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(
            nameof(RefusalRegisterEntry),
            entry.Id,
            "RefusalRegisterEntryReviewed",
            entry.ShopId,
            cancellationToken: cancellationToken);

        return entry.ToDto();
    }

    public async Task<IReadOnlyCollection<RefusalRegisterEntryDto>> ReviewEntriesAsync(ReviewRefusalRegisterEntriesRequest request, CancellationToken cancellationToken = default)
    {
        if (!_currentUserService.IsInRole(RoleNames.ShopOwner) && !_currentUserService.IsInRole(RoleNames.Manager))
        {
            throw new AppException(ErrorCodes.UnauthorizedRole, "Only manager or shop owner can review refusal entries.", 403);
        }

        var reviewedByUserId = _currentUserService.UserId
            ?? throw new AppException("unauthorized", "Signed-in user is required.");
        var entryIds = request.EntryIds
            .Where(x => x != Guid.Empty)
            .Distinct()
            .ToArray();
        if (entryIds.Length == 0)
        {
            throw new AppException("refusal_review_entries_required", "At least one refusal entry must be selected.");
        }

        var entries = await _entryRepository.Query()
            .Where(x => x.ShopId == request.ShopId && entryIds.Contains(x.Id))
            .OrderByDescending(x => x.RefusalDate)
            .ThenBy(x => x.SequenceNo)
            .ToListAsync(cancellationToken);
        if (entries.Count != entryIds.Length)
        {
            throw new AppException("refusal_review_entries_invalid", "One or more selected refusal entries were not found.");
        }

        var signatureBytes = ParseSignatureBytes(request.SignatureDataUrl);
        foreach (var entry in entries)
        {
            await ApplyReviewAsync(entry, reviewedByUserId, request.Notes, signatureBytes, cancellationToken);
            _entryRepository.Update(entry);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        foreach (var entry in entries)
        {
            await _auditService.LogAsync(
                nameof(RefusalRegisterEntry),
                entry.Id,
                "RefusalRegisterEntryReviewed",
                entry.ShopId,
                cancellationToken: cancellationToken);
        }

        return entries.Select(x => x.ToDto()).ToArray();
    }

    public async Task<RefusalRegisterDailySignoffDto> SignOffDailyAsync(SignOffRefusalRegisterDailyRequest request, CancellationToken cancellationToken = default)
    {
        if (!_currentUserService.IsInRole(RoleNames.ShopOwner) && !_currentUserService.IsInRole(RoleNames.Manager))
        {
            throw new AppException(ErrorCodes.UnauthorizedRole, "Only manager or shop owner can sign off refusals register.", 403);
        }

        var entryCount = await _entryRepository.Query()
            .AsNoTracking()
            .CountAsync(x => x.ShopId == request.ShopId && x.RefusalDate == request.SignoffDate, cancellationToken);
        if (entryCount == 0)
        {
            throw new AppException("refusal_no_entries", "At least one refusal entry is required before signoff.");
        }

        var now = DateTimeOffset.UtcNow;
        var signedByUserId = _currentUserService.UserId
            ?? throw new AppException("unauthorized", "Signed-in user is required.");
        var initials = BuildInitials(request.SignedByInitials, _currentUserService.FullName, _currentUserService.Email);
        var signaturePath = await SaveSignatureImageAsync(request.SignatureDataUrl, request.ShopId, request.SignoffDate, "daily-signoff", cancellationToken);

        var existing = await _signoffRepository.Query()
            .FirstOrDefaultAsync(x => x.ShopId == request.ShopId && x.SignoffDate == request.SignoffDate, cancellationToken);

        var auditAction = "RefusalRegisterDailySignedOff";
        RefusalRegisterDailySignoff signoff;
        if (existing is null)
        {
            signoff = new RefusalRegisterDailySignoff
            {
                ShopId = request.ShopId,
                SignoffDate = request.SignoffDate,
                SignedByUserId = signedByUserId,
                SignedByInitials = initials,
                SignedByName = _currentUserService.FullName,
                SignedOn = now,
                Notes = request.Notes?.Trim(),
                SignatureImagePath = signaturePath,
                CreatedOn = now,
                CreatedBy = signedByUserId
            };

            await _signoffRepository.AddAsync(signoff, cancellationToken);
        }
        else
        {
            TryDeleteSignatureImage(existing.SignatureImagePath);
            existing.SignedByUserId = signedByUserId;
            existing.SignedByInitials = initials;
            existing.SignedByName = _currentUserService.FullName;
            existing.SignedOn = now;
            existing.Notes = request.Notes?.Trim();
            existing.SignatureImagePath = signaturePath;
            existing.ModifiedOn = now;
            existing.ModifiedBy = signedByUserId;
            signoff = existing;

            _signoffRepository.Update(existing);
            auditAction = "RefusalRegisterDailySignoffUpdated";
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(
            nameof(RefusalRegisterDailySignoff),
            signoff.Id,
            auditAction,
            request.ShopId,
            cancellationToken: cancellationToken);

        return signoff.ToDto();
    }

    public async Task ReopenDailyAsync(ReopenRefusalRegisterDailyRequest request, CancellationToken cancellationToken = default)
    {
        if (!_currentUserService.IsInRole(RoleNames.ShopOwner) && !_currentUserService.IsInRole(RoleNames.Manager))
        {
            throw new AppException(ErrorCodes.UnauthorizedRole, "Only manager or shop owner can reopen refusals register.", 403);
        }

        var signoff = await _signoffRepository.Query()
            .FirstOrDefaultAsync(x => x.ShopId == request.ShopId && x.SignoffDate == request.SignoffDate, cancellationToken)
            ?? throw new AppException("refusal_signoff_not_found", "Daily signoff not found.", 404);

        TryDeleteSignatureImage(signoff.SignatureImagePath);
        _signoffRepository.Remove(signoff);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(
            nameof(RefusalRegisterDailySignoff),
            signoff.Id,
            "RefusalRegisterDailyReopened",
            request.ShopId,
            cancellationToken: cancellationToken);
    }

    private static string BuildInitials(string? preferredInitials, string fullName, string email)
    {
        var preferred = NormalizeInitials(preferredInitials);
        if (!string.IsNullOrWhiteSpace(preferred))
        {
            return preferred;
        }

        var initialsFromName = string.Concat(
            fullName
                .Split(' ', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
                .Select(x => x[0]));
        var fromName = NormalizeInitials(initialsFromName);
        if (!string.IsNullOrWhiteSpace(fromName))
        {
            return fromName;
        }

        if (!string.IsNullOrWhiteSpace(email))
        {
            return NormalizeInitials(email[..1]);
        }

        return "NA";
    }

    private static string NormalizeInitials(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var cleaned = new string(value.Where(char.IsLetterOrDigit).ToArray()).ToUpperInvariant();
        if (cleaned.Length <= 20)
        {
            return cleaned;
        }

        return cleaned[..20];
    }

    private async Task ApplyReviewAsync(
        RefusalRegisterEntry entry,
        Guid reviewedByUserId,
        string? notes,
        string? signatureDataUrl,
        CancellationToken cancellationToken)
    {
        byte[]? signatureBytes = null;
        if (!string.IsNullOrWhiteSpace(signatureDataUrl))
        {
            signatureBytes = ParseSignatureBytes(signatureDataUrl);
        }

        await ApplyReviewAsync(entry, reviewedByUserId, notes, signatureBytes, cancellationToken);
    }

    private async Task ApplyReviewAsync(
        RefusalRegisterEntry entry,
        Guid reviewedByUserId,
        string? notes,
        byte[]? signatureBytes,
        CancellationToken cancellationToken)
    {
        if (signatureBytes is not null)
        {
            var reviewSignaturePath = await SaveSignatureImageAsync(
                signatureBytes,
                entry.ShopId,
                entry.RefusalDate,
                "reviews",
                cancellationToken);
            TryDeleteSignatureImage(entry.ReviewSignatureImagePath);
            entry.ReviewSignatureImagePath = reviewSignaturePath;
        }

        var now = DateTimeOffset.UtcNow;
        entry.ReviewedOn = now;
        entry.ReviewedByUserId = reviewedByUserId;
        entry.ReviewedByName = _currentUserService.FullName;
        entry.ReviewNotes = notes?.Trim();
        entry.ModifiedOn = now;
        entry.ModifiedBy = reviewedByUserId;
    }

    private static async Task<string> SaveSignatureImageAsync(
        string signatureDataUrl,
        Guid shopId,
        DateOnly date,
        string sectionFolder,
        CancellationToken cancellationToken)
    {
        var bytes = ParseSignatureBytes(signatureDataUrl);
        return await SaveSignatureImageAsync(bytes, shopId, date, sectionFolder, cancellationToken);
    }

    private static async Task<string> SaveSignatureImageAsync(
        byte[] bytes,
        Guid shopId,
        DateOnly date,
        string sectionFolder,
        CancellationToken cancellationToken)
    {
        var projectRoot = ResolveProjectRootPath();
        var folderPath = Path.Combine(
            projectRoot,
            "SignatureUploads",
            "RefusalRegister",
            sectionFolder,
            shopId.ToString("N"),
            date.ToString("yyyyMMdd"));

        Directory.CreateDirectory(folderPath);

        var fileName = $"signature-{DateTime.UtcNow:yyyyMMddHHmmssfff}-{Guid.NewGuid():N}.png";
        var fullPath = Path.Combine(folderPath, fileName);
        await File.WriteAllBytesAsync(fullPath, bytes, cancellationToken);
        return fullPath;
    }

    private static byte[] ParseSignatureBytes(string signatureDataUrl)
    {
        if (string.IsNullOrWhiteSpace(signatureDataUrl))
        {
            throw new AppException("refusal_signature_required", "Signature is required.");
        }

        const string marker = "base64,";
        var markerIndex = signatureDataUrl.IndexOf(marker, StringComparison.OrdinalIgnoreCase);
        var payload = markerIndex >= 0 ? signatureDataUrl[(markerIndex + marker.Length)..] : signatureDataUrl;
        payload = payload.Trim();

        try
        {
            return Convert.FromBase64String(payload);
        }
        catch (FormatException)
        {
            throw new AppException("refusal_signature_invalid", "Signature image format is invalid.");
        }
    }

    private static async Task<string?> ReadSignatureDataUrlAsync(string? signatureImagePath, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(signatureImagePath))
        {
            return null;
        }

        if (!File.Exists(signatureImagePath))
        {
            return null;
        }

        var bytes = await File.ReadAllBytesAsync(signatureImagePath, cancellationToken);
        return $"data:image/png;base64,{Convert.ToBase64String(bytes)}";
    }

    private static void TryDeleteSignatureImage(string? signatureImagePath)
    {
        if (string.IsNullOrWhiteSpace(signatureImagePath))
        {
            return;
        }

        try
        {
            if (File.Exists(signatureImagePath))
            {
                File.Delete(signatureImagePath);
            }
        }
        catch
        {
            // Ignore cleanup errors; they should not block business flow.
        }
    }

    private static string ResolveProjectRootPath()
    {
        var current = new DirectoryInfo(Directory.GetCurrentDirectory());
        while (current is not null)
        {
            var solutionPath = Path.Combine(current.FullName, "ScratchCard.slnx");
            if (File.Exists(solutionPath))
            {
                return current.FullName;
            }

            current = current.Parent;
        }

        return Directory.GetCurrentDirectory();
    }
}
