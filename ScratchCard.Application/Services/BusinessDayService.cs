using System.Globalization;
using System.Net;
using System.Text;
using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Models;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.BusinessDays;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Entities;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.Services;

public class BusinessDayService : IBusinessDayService
{
    private readonly IRepository<BusinessDay> _businessDayRepository;
    private readonly IRepository<Shift> _shiftRepository;
    private readonly IRepository<ShiftOpeningSerial> _shiftOpeningSerialRepository;
    private readonly IRepository<ShiftScratchCardSale> _salesRepository;
    private readonly IRepository<PrizePayout> _payoutRepository;
    private readonly IRepository<ScratchCardDayCloseSummary> _dayCloseSummaryRepository;
    private readonly IRepository<BusinessDayCloseAttachment> _dayCloseAttachmentRepository;
    private readonly IRepository<ShopUser> _shopUserRepository;
    private readonly IRepository<Shop> _shopRepository;
    private readonly IShopConfigurationService _shopConfigurationService;
    private readonly INotificationService _notificationService;
    private readonly IAuditService _auditService;
    private readonly ICurrentUserService _currentUserService;
    private readonly IUnitOfWork _unitOfWork;

    public BusinessDayService(
        IRepository<BusinessDay> businessDayRepository,
        IRepository<Shift> shiftRepository,
        IRepository<ShiftOpeningSerial> shiftOpeningSerialRepository,
        IRepository<ShiftScratchCardSale> salesRepository,
        IRepository<PrizePayout> payoutRepository,
        IRepository<ScratchCardDayCloseSummary> dayCloseSummaryRepository,
        IRepository<BusinessDayCloseAttachment> dayCloseAttachmentRepository,
        IRepository<ShopUser> shopUserRepository,
        IRepository<Shop> shopRepository,
        IShopConfigurationService shopConfigurationService,
        INotificationService notificationService,
        IAuditService auditService,
        ICurrentUserService currentUserService,
        IUnitOfWork unitOfWork)
    {
        _businessDayRepository = businessDayRepository;
        _shiftRepository = shiftRepository;
        _shiftOpeningSerialRepository = shiftOpeningSerialRepository;
        _salesRepository = salesRepository;
        _payoutRepository = payoutRepository;
        _dayCloseSummaryRepository = dayCloseSummaryRepository;
        _dayCloseAttachmentRepository = dayCloseAttachmentRepository;
        _shopUserRepository = shopUserRepository;
        _shopRepository = shopRepository;
        _shopConfigurationService = shopConfigurationService;
        _notificationService = notificationService;
        _auditService = auditService;
        _currentUserService = currentUserService;
        _unitOfWork = unitOfWork;
    }

    public async Task<BusinessDayDto> OpenAsync(OpenBusinessDayRequest request, CancellationToken cancellationToken = default)
    {
        var existing = await _businessDayRepository.Query()
            .FirstOrDefaultAsync(x => x.ShopId == request.ShopId && x.BusinessDate == request.BusinessDate, cancellationToken);

        if (existing is not null && existing.Status != BusinessDayStatus.Closed)
        {
            throw new AppException("business_day_already_open", "Business day is already open for this date.");
        }

        if (existing is not null && existing.Status == BusinessDayStatus.Closed)
        {
            throw new AppException("business_day_already_closed", "Business day already exists and is closed.");
        }

        var day = new BusinessDay
        {
            ShopId = request.ShopId,
            BusinessDate = request.BusinessDate,
            Status = BusinessDayStatus.Open,
            OpenedByUserId = _currentUserService.UserId ?? Guid.Empty,
            OpenedOn = DateTimeOffset.UtcNow,
            CreatedOn = DateTimeOffset.UtcNow,
            CreatedBy = _currentUserService.UserId
        };

        await _businessDayRepository.AddAsync(day, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        await AutoCreateScheduledShiftsAsync(day, cancellationToken);

        await _auditService.LogAsync(nameof(BusinessDay), day.Id, "BusinessDayOpened", day.ShopId, cancellationToken: cancellationToken);
        var openedDayDto = day.ToDto();
        openedDayDto.MissingOpeningTicketCount = 0;
        openedDayDto.MissingOpeningTicketDetails = [];
        return openedDayDto;
    }

    public async Task<IReadOnlyCollection<BusinessDayDto>> ListAsync(Guid shopId, DateOnly? from = null, DateOnly? to = null, CancellationToken cancellationToken = default)
    {
        var query = _businessDayRepository.Query()
            .AsNoTracking()
            .Include(x => x.ScratchCardDayCloseSummary)
            .Include(x => x.CloseAttachments)
            .Where(x => x.ShopId == shopId);

        if (from.HasValue)
        {
            query = query.Where(x => x.BusinessDate >= from.Value);
        }

        if (to.HasValue)
        {
            query = query.Where(x => x.BusinessDate <= to.Value);
        }

        var days = await query
            .OrderByDescending(x => x.BusinessDate)
            .ToListAsync(cancellationToken);
        var missingByDayId = await GetMissingOpeningTicketsByDayIdAsync(days.Select(x => x.Id), cancellationToken);
        var missingDetailsByDayId = await GetMissingOpeningTicketDetailsByDayIdAsync(days.Select(x => x.Id), cancellationToken);
        return days.Select(day =>
        {
            var dto = day.ToDto();
            dto.MissingOpeningTicketCount = missingByDayId.GetValueOrDefault(day.Id);
            dto.MissingOpeningTicketDetails = missingDetailsByDayId.GetValueOrDefault(day.Id, []);
            return dto;
        }).ToArray();
    }

    public async Task<BusinessDayDto> GetAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var day = await _businessDayRepository.Query()
            .Include(x => x.ScratchCardDayCloseSummary)
            .Include(x => x.CloseAttachments)
            .FirstOrDefaultAsync(x => x.Id == id, cancellationToken)
            ?? throw new AppException("business_day_not_found", "Business day not found.", 404);
        var missingByDayId = await GetMissingOpeningTicketsByDayIdAsync([day.Id], cancellationToken);
        var missingDetailsByDayId = await GetMissingOpeningTicketDetailsByDayIdAsync([day.Id], cancellationToken);
        var dayDto = day.ToDto();
        dayDto.MissingOpeningTicketCount = missingByDayId.GetValueOrDefault(day.Id);
        dayDto.MissingOpeningTicketDetails = missingDetailsByDayId.GetValueOrDefault(day.Id, []);
        return dayDto;
    }

    public async Task<string?> GetCloseAttachmentDataUrlAsync(Guid attachmentId, CancellationToken cancellationToken = default)
    {
        var attachment = await _dayCloseAttachmentRepository.Query()
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == attachmentId, cancellationToken)
            ?? throw new AppException("business_day_attachment_not_found", "Business day attachment not found.", 404);

        return await ReadAttachmentDataUrlAsync(attachment.StoredPath, attachment.ContentType, cancellationToken);
    }

    public async Task<BusinessDayDto> CloseAsync(Guid id, CloseBusinessDayRequest request, CancellationToken cancellationToken = default)
    {
        var day = await _businessDayRepository.GetByIdAsync(id, cancellationToken)
            ?? throw new AppException("business_day_not_found", "Business day not found.", 404);

        var shifts = await _shiftRepository.Query()
            .Where(x => x.BusinessDayId == id)
            .ToListAsync(cancellationToken);

        if (shifts.Any(x => x.Status == ShiftStatus.Open || x.Status == ShiftStatus.Reopened))
        {
            throw new AppException(ErrorCodes.BusinessDayHasOpenShifts, "Close all shifts before day close.");
        }

        if (shifts.Any(x => x.SyncStatus is SyncStatus.PendingSync or SyncStatus.Syncing or SyncStatus.Conflict or SyncStatus.SyncFailed))
        {
            throw new AppException(ErrorCodes.BusinessDayHasPendingSyncShifts, "Pending sync shifts must be resolved before day close.");
        }

        var shiftIds = shifts.Select(x => x.Id).ToArray();
        var totalSales = await _salesRepository.Query()
            .Where(x => shiftIds.Contains(x.ShiftId))
            .SumAsync(x => x.SalesAmount, cancellationToken);

        var totalPayout = await _payoutRepository.Query()
            .Where(x => x.BusinessDayId == day.Id)
            .SumAsync(x => x.PrizeAmount, cancellationToken);

        day.TotalSalesAmount = totalSales;
        day.TotalPrizePayout = totalPayout;
        day.ExpectedCash = totalSales - totalPayout;
        day.Difference = request.TillPayout - day.ExpectedCash;
        day.Notes = request.Notes;

        var existingAttachments = await _dayCloseAttachmentRepository.Query()
            .Where(x => x.BusinessDayId == day.Id)
            .ToListAsync(cancellationToken);

        foreach (var existingAttachment in existingAttachments)
        {
            CloseAttachmentStorage.TryDelete(existingAttachment.StoredPath);
            _dayCloseAttachmentRepository.Remove(existingAttachment);
        }

        var attachmentInputs = CloseAttachmentStorage.BuildInputs(
            request.Attachments,
            request.AttachmentFileName,
            request.AttachmentBase64);

        if (attachmentInputs.Count > 0)
        {
            var savedAttachments = await CloseAttachmentStorage.SaveDayAttachmentsAsync(
                attachmentInputs,
                day.ShopId,
                day.BusinessDate,
                cancellationToken);

            var now = DateTimeOffset.UtcNow;
            var createdBy = _currentUserService.UserId;
            var closeAttachments = savedAttachments.Select(saved => new BusinessDayCloseAttachment
            {
                BusinessDayId = day.Id,
                ShopId = day.ShopId,
                OriginalFileName = saved.OriginalFileName,
                StoredFileName = saved.StoredFileName,
                StoredPath = saved.StoredPath,
                ContentType = saved.ContentType,
                FileSizeBytes = saved.FileSizeBytes,
                CreatedOn = now,
                CreatedBy = createdBy
            }).ToArray();

            await _dayCloseAttachmentRepository.AddRangeAsync(closeAttachments, cancellationToken);
        }

        day.ClosedByUserId = _currentUserService.UserId;
        day.ClosedOn = DateTimeOffset.UtcNow;
        day.Status = BusinessDayStatus.Closed;
        day.ModifiedOn = DateTimeOffset.UtcNow;
        day.ModifiedBy = _currentUserService.UserId;

        var existingSummary = await _dayCloseSummaryRepository.Query()
            .FirstOrDefaultAsync(x => x.BusinessDayId == day.Id, cancellationToken);

        if (existingSummary is null)
        {
            var createdSummary = new ScratchCardDayCloseSummary
            {
                BusinessDayId = day.Id,
                LottoPayout = request.LottoPayout,
                ScratchCardPayout = request.ScratchCardPayout,
                TillPayout = request.TillPayout,
                CreatedOn = DateTimeOffset.UtcNow,
                CreatedBy = _currentUserService.UserId
            };
            await _dayCloseSummaryRepository.AddAsync(createdSummary, cancellationToken);
            day.ScratchCardDayCloseSummary = createdSummary;
        }
        else
        {
            existingSummary.LottoPayout = request.LottoPayout;
            existingSummary.ScratchCardPayout = request.ScratchCardPayout;
            existingSummary.TillPayout = request.TillPayout;
            existingSummary.ModifiedOn = DateTimeOffset.UtcNow;
            existingSummary.ModifiedBy = _currentUserService.UserId;
            _dayCloseSummaryRepository.Update(existingSummary);
            day.ScratchCardDayCloseSummary = existingSummary;
        }

        _businessDayRepository.Update(day);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(nameof(BusinessDay), day.Id, "DayClosed", day.ShopId, cancellationToken: cancellationToken);

        var daySalesEntries = shiftIds.Length == 0
            ? []
            : await _salesRepository.Query()
                .AsNoTracking()
                .Where(x => shiftIds.Contains(x.ShiftId))
                .Include(x => x.Pack)
                    .ThenInclude(x => x.Game)
                .ToArrayAsync(cancellationToken);

        await SendDayCloseSummaryToOwnersAsync(day, shifts, daySalesEntries, cancellationToken);

        var closedDay = await _businessDayRepository.Query()
            .AsNoTracking()
            .Include(x => x.ScratchCardDayCloseSummary)
            .Include(x => x.CloseAttachments)
            .FirstOrDefaultAsync(x => x.Id == day.Id, cancellationToken)
            ?? day;
        var missingByDayId = await GetMissingOpeningTicketsByDayIdAsync([closedDay.Id], cancellationToken);
        var missingDetailsByDayId = await GetMissingOpeningTicketDetailsByDayIdAsync([closedDay.Id], cancellationToken);
        var closedDayDto = closedDay.ToDto();
        closedDayDto.MissingOpeningTicketCount = missingByDayId.GetValueOrDefault(closedDay.Id);
        closedDayDto.MissingOpeningTicketDetails = missingDetailsByDayId.GetValueOrDefault(closedDay.Id, []);
        return closedDayDto;
    }

    public async Task<BusinessDayDto> ReopenAsync(Guid id, ReopenBusinessDayRequest request, CancellationToken cancellationToken = default)
    {
        var day = await _businessDayRepository.GetByIdAsync(id, cancellationToken)
            ?? throw new AppException("business_day_not_found", "Business day not found.", 404);

        day.Status = BusinessDayStatus.Reopened;
        day.ClosedByUserId = null;
        day.ClosedOn = null;
        day.ModifiedOn = DateTimeOffset.UtcNow;
        day.ModifiedBy = _currentUserService.UserId;

        _businessDayRepository.Update(day);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(
            nameof(BusinessDay),
            day.Id,
            "DayReopened",
            day.ShopId,
            reason: request.Reason,
            cancellationToken: cancellationToken);
        var missingByDayId = await GetMissingOpeningTicketsByDayIdAsync([day.Id], cancellationToken);
        var missingDetailsByDayId = await GetMissingOpeningTicketDetailsByDayIdAsync([day.Id], cancellationToken);
        var reopenedDto = day.ToDto();
        reopenedDto.MissingOpeningTicketCount = missingByDayId.GetValueOrDefault(day.Id);
        reopenedDto.MissingOpeningTicketDetails = missingDetailsByDayId.GetValueOrDefault(day.Id, []);
        return reopenedDto;
    }

    private async Task AutoCreateScheduledShiftsAsync(BusinessDay day, CancellationToken cancellationToken)
    {
        var setup = await _shopConfigurationService.GetShiftSetupAsync(day.ShopId, cancellationToken);
        var activeTemplates = setup.ShiftTemplates
            .Where(x => x.IsActive)
            .ToArray();

        if (activeTemplates.Length == 0)
        {
            return;
        }

        var existingNames = await _shiftRepository.Query()
            .AsNoTracking()
            .Where(x => x.BusinessDayId == day.Id)
            .Select(x => x.ShiftName)
            .ToListAsync(cancellationToken);

        var usedNames = new HashSet<string>(existingNames, StringComparer.OrdinalIgnoreCase);
        var now = DateTimeOffset.UtcNow;
        var newShifts = new List<Shift>(activeTemplates.Length);

        foreach (var template in activeTemplates)
        {
            var shiftName = BuildUniqueShiftName(template.Name, usedNames);
            if (string.IsNullOrWhiteSpace(shiftName))
            {
                continue;
            }

            var scheduledStart = ToUtcDateTime(day.BusinessDate, template.StartTime, setup.TimeZoneId);
            var endDate = template.EndTime <= template.StartTime
                ? day.BusinessDate.AddDays(1)
                : day.BusinessDate;
            var scheduledEnd = ToUtcDateTime(endDate, template.EndTime, setup.TimeZoneId);

            newShifts.Add(new Shift
            {
                BusinessDayId = day.Id,
                ShopId = day.ShopId,
                ShiftName = shiftName,
                StartTime = scheduledStart,
                EndTime = scheduledEnd,
                OpenedByUserId = day.OpenedByUserId,
                Status = ShiftStatus.Scheduled,
                SyncStatus = SyncStatus.Synced,
                Notes = ShiftMetadata.BuildAutoCreatedNote(template.TemplateId, template.StartTime, template.EndTime),
                CreatedOn = now,
                CreatedBy = _currentUserService.UserId
            });
        }

        if (newShifts.Count == 0)
        {
            return;
        }

        await _shiftRepository.AddRangeAsync(newShifts, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        foreach (var shift in newShifts)
        {
            await _auditService.LogAsync(
                nameof(Shift),
                shift.Id,
                "ShiftAutoCreated",
                shift.ShopId,
                reason: shift.ShiftName,
                cancellationToken: cancellationToken);
        }
    }

    private static string BuildUniqueShiftName(string requestedName, ISet<string> usedNames)
    {
        var baseName = string.IsNullOrWhiteSpace(requestedName)
            ? "Shift"
            : requestedName.Trim();

        if (baseName.Length > 100)
        {
            baseName = baseName[..100].TrimEnd();
        }

        if (usedNames.Add(baseName))
        {
            return baseName;
        }

        var sequence = 2;
        while (sequence < 1000)
        {
            var suffix = $" {sequence}";
            var allowedNameLength = Math.Max(1, 100 - suffix.Length);
            var candidate = $"{baseName[..Math.Min(baseName.Length, allowedNameLength)].TrimEnd()}{suffix}";
            if (usedNames.Add(candidate))
            {
                return candidate;
            }

            sequence++;
        }

        return string.Empty;
    }

    private static DateTimeOffset ToUtcDateTime(DateOnly businessDate, TimeSpan timeOfDay, string? timeZoneId)
    {
        var localDateTime = businessDate.ToDateTime(TimeOnly.FromTimeSpan(timeOfDay), DateTimeKind.Unspecified);
        var zone = ResolveTimeZone(timeZoneId);
        if (zone is null)
        {
            return new DateTimeOffset(localDateTime, TimeSpan.Zero);
        }

        var offset = zone.GetUtcOffset(localDateTime);
        var localOffsetTime = new DateTimeOffset(localDateTime, offset);
        return localOffsetTime.ToUniversalTime();
    }

    private static TimeZoneInfo? ResolveTimeZone(string? timeZoneId)
    {
        if (string.IsNullOrWhiteSpace(timeZoneId))
        {
            return null;
        }

        static TimeZoneInfo? TryResolve(string id)
        {
            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById(id);
            }
            catch
            {
                return null;
            }
        }

        var normalized = timeZoneId.Trim();
        var resolved = TryResolve(normalized);
        if (resolved is not null)
        {
            return resolved;
        }

        if (string.Equals(normalized, "Europe/London", StringComparison.OrdinalIgnoreCase))
        {
            return TryResolve("GMT Standard Time");
        }

        if (string.Equals(normalized, "GMT Standard Time", StringComparison.OrdinalIgnoreCase))
        {
            return TryResolve("Europe/London");
        }

        return null;
    }

    private static async Task<string?> ReadAttachmentDataUrlAsync(
        string? storedPath,
        string? contentType,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(storedPath) || !File.Exists(storedPath))
        {
            return null;
        }

        var bytes = await File.ReadAllBytesAsync(storedPath, cancellationToken);
        if (bytes.Length == 0)
        {
            return null;
        }

        var mimeType = string.IsNullOrWhiteSpace(contentType)
            ? ResolveAttachmentContentTypeFromExtension(Path.GetExtension(storedPath))
            : contentType.Trim();

        return $"data:{mimeType};base64,{Convert.ToBase64String(bytes)}";
    }

    private static string ResolveAttachmentContentTypeFromExtension(string? extension)
    {
        return extension?.ToLowerInvariant() switch
        {
            ".jpg" or ".jpeg" => "image/jpeg",
            ".png" => "image/png",
            ".webp" => "image/webp",
            ".gif" => "image/gif",
            ".pdf" => "application/pdf",
            ".txt" => "text/plain",
            _ => "application/octet-stream"
        };
    }

    private async Task<Dictionary<Guid, int>> GetMissingOpeningTicketsByDayIdAsync(
        IEnumerable<Guid> businessDayIds,
        CancellationToken cancellationToken)
    {
        var ids = businessDayIds.Distinct().ToArray();
        if (ids.Length == 0)
        {
            return new Dictionary<Guid, int>();
        }

        return await _shiftOpeningSerialRepository.Query()
            .AsNoTracking()
            .Where(x => ids.Contains(x.BusinessDayId))
            .GroupBy(x => x.BusinessDayId)
            .Select(group => new
            {
                BusinessDayId = group.Key,
                MissingTicketCount = group.Sum(x => x.MissingQuantity)
            })
            .ToDictionaryAsync(x => x.BusinessDayId, x => x.MissingTicketCount, cancellationToken);
    }

    private async Task<Dictionary<Guid, IReadOnlyCollection<MissingOpeningTicketDetailDto>>> GetMissingOpeningTicketDetailsByDayIdAsync(
        IEnumerable<Guid> businessDayIds,
        CancellationToken cancellationToken)
    {
        var ids = businessDayIds.Distinct().ToArray();
        if (ids.Length == 0)
        {
            return new Dictionary<Guid, IReadOnlyCollection<MissingOpeningTicketDetailDto>>();
        }

        var rows = await _shiftOpeningSerialRepository.Query()
            .AsNoTracking()
            .Where(x => ids.Contains(x.BusinessDayId) && x.MissingQuantity > 0)
            .OrderBy(x => x.BusinessDayId)
            .ThenBy(x => x.Pack.DisplayNumber)
            .ThenBy(x => x.Pack.Game.GameName)
            .ThenBy(x => x.Pack.PackNumber)
            .Select(x => new
            {
                x.BusinessDayId,
                Detail = new MissingOpeningTicketDetailDto
                {
                    ShiftId = x.ShiftId,
                    ShiftName = x.Shift.ShiftName,
                    PackId = x.PackId,
                    PackNumber = x.Pack.PackNumber,
                    DisplayNumber = x.Pack.DisplayNumber,
                    GameName = x.Pack.Game.GameName,
                    GameCode = x.Pack.Game.GameCode,
                    ExpectedOpeningSerialNumber = x.ExpectedOpeningSerialNumber,
                    ActualOpeningSerialNumber = x.ActualOpeningSerialNumber,
                    MissingQuantity = x.MissingQuantity,
                    OverageQuantity = x.OverageQuantity
                }
            })
            .ToListAsync(cancellationToken);

        return rows
            .GroupBy(x => x.BusinessDayId)
            .ToDictionary(
                group => group.Key,
                group => (IReadOnlyCollection<MissingOpeningTicketDetailDto>)group.Select(x => x.Detail).ToArray());
    }

    private async Task SendDayCloseSummaryToOwnersAsync(
        BusinessDay day,
        IReadOnlyCollection<Shift> shifts,
        IReadOnlyCollection<ShiftScratchCardSale> entries,
        CancellationToken cancellationToken)
    {
        var recipients = await ResolveSummaryRecipientsAsync(day.ShopId, cancellationToken);

        if (recipients.Count == 0)
        {
            return;
        }

        var shopName = await _shopRepository.Query()
            .AsNoTracking()
            .Where(x => x.Id == day.ShopId)
            .Select(x => x.ShopName)
            .FirstOrDefaultAsync(cancellationToken) ?? "Unknown Shop";

        var missingOpeningTicketCount = await _shiftOpeningSerialRepository.Query()
            .AsNoTracking()
            .Where(x => x.BusinessDayId == day.Id)
            .SumAsync(x => (int?)x.MissingQuantity, cancellationToken) ?? 0;

        var subject = $"Day Close Summary - {shopName} - {day.BusinessDate:yyyy-MM-dd}";
        var body = BuildDayCloseSummaryBodyHtml(shopName, day, shifts, entries, missingOpeningTicketCount);

        foreach (var recipient in recipients)
        {
            try
            {
                await _notificationService.SendAsync(new NotificationMessage
                {
                    ShopId = day.ShopId,
                    NotificationType = NotificationType.DayCloseSummary,
                    Channel = NotificationChannel.Email,
                    Recipient = recipient,
                    Subject = subject,
                    Body = body,
                    IsBodyHtml = true,
                    RelatedEntityName = nameof(BusinessDay),
                    RelatedEntityId = day.Id
                }, cancellationToken);
            }
            catch
            {
                // Notification failures are logged by notification service and must not block day close.
            }
        }
    }

    private async Task<List<string>> ResolveSummaryRecipientsAsync(Guid shopId, CancellationToken cancellationToken)
    {
        var recipients = await _shopUserRepository.Query()
            .AsNoTracking()
            .Where(x =>
                x.ShopId == shopId &&
                x.IsActive &&
                !string.IsNullOrWhiteSpace(x.User.Email) &&
                (x.Role.Name == RoleNames.ShopOwner || x.Role.Name == RoleNames.Manager))
            .Select(x => x.User.Email)
            .ToListAsync(cancellationToken);

        if (recipients.Count == 0 && _currentUserService.UserId is Guid currentUserId)
        {
            var fallbackRecipient = await _shopUserRepository.Query()
                .AsNoTracking()
                .Where(x =>
                    x.ShopId == shopId &&
                    x.IsActive &&
                    x.UserId == currentUserId &&
                    !string.IsNullOrWhiteSpace(x.User.Email))
                .Select(x => x.User.Email)
                .FirstOrDefaultAsync(cancellationToken);

            if (!string.IsNullOrWhiteSpace(fallbackRecipient))
            {
                recipients.Add(fallbackRecipient);
            }
        }

        return recipients
            .Select(x => x.Trim())
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static string BuildDayCloseSummaryBodyHtml(
        string shopName,
        BusinessDay day,
        IReadOnlyCollection<Shift> shifts,
        IReadOnlyCollection<ShiftScratchCardSale> entries,
        int missingOpeningTicketCount)
    {
        var rows = entries
            .Select(entry => new
            {
                DisplayNumber = entry.Pack?.DisplayNumber,
                GameName = entry.Pack?.Game?.GameName ?? "Unknown",
                TicketPrice = entry.TicketPrice,
                SoldQuantity = entry.SoldQuantity,
                SalesAmount = entry.SalesAmount
            })
            .GroupBy(x => new { x.DisplayNumber, x.GameName, x.TicketPrice })
            .Select(group => new
            {
                group.Key.DisplayNumber,
                group.Key.GameName,
                group.Key.TicketPrice,
                SoldQuantity = group.Sum(x => x.SoldQuantity),
                SalesAmount = group.Sum(x => x.SalesAmount)
            })
            .OrderBy(x => x.DisplayNumber ?? int.MaxValue)
            .ThenBy(x => x.GameName, StringComparer.OrdinalIgnoreCase)
            .ToArray();

        var totalSoldQty = rows.Sum(x => x.SoldQuantity);
        var totalSales = rows.Sum(x => x.SalesAmount);
        var summary = day.ScratchCardDayCloseSummary;
        var tillPayout = summary?.TillPayout ?? 0m;
        var tillBasedDifference = tillPayout - day.ExpectedCash;
        var shiftCount = shifts.Count;
        var shiftSalesById = entries
            .GroupBy(x => x.ShiftId)
            .ToDictionary(group => group.Key, group => group.Sum(x => x.SalesAmount));

        var orderedShifts = shifts
            .OrderBy(x => x.StartTime)
            .ThenBy(x => x.ShiftName, StringComparer.OrdinalIgnoreCase)
            .ToArray();

        var differenceClass = tillBasedDifference > 0.009m
            ? "variance-up"
            : tillBasedDifference < -0.009m
                ? "variance-down"
                : "variance-balanced";

        var shiftRowsHtml = orderedShifts.Length == 0
            ? "<tr><td colspan=\"4\" class=\"empty\">No shifts found.</td></tr>"
            : string.Join(
                string.Empty,
                orderedShifts.Select(shift =>
                {
                    var shiftSales = shiftSalesById.TryGetValue(shift.Id, out var total) ? total : 0m;
                    return
                        "<tr>" +
                        $"<td>{WebUtility.HtmlEncode(shift.ShiftName)}</td>" +
                        $"<td>{shift.StartTime.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture)}</td>" +
                        $"<td>{(shift.EndTime?.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture) ?? "-")}</td>" +
                        $"<td class=\"num\">{shiftSales.ToString("0.00", CultureInfo.InvariantCulture)}</td>" +
                        "</tr>";
                }));

        var salesRowsHtml = rows.Length == 0
            ? "<tr><td colspan=\"5\" class=\"empty\">No shift entries.</td></tr>"
            : string.Join(
                string.Empty,
                rows.Select(row =>
                {
                    var display = row.DisplayNumber.HasValue
                        ? row.DisplayNumber.Value.ToString(CultureInfo.InvariantCulture)
                        : "-";
                    return
                        "<tr>" +
                        $"<td>{display}</td>" +
                        $"<td>{WebUtility.HtmlEncode(row.GameName)}</td>" +
                        $"<td class=\"num\">{row.TicketPrice.ToString("0.00", CultureInfo.InvariantCulture)}</td>" +
                        $"<td class=\"num\">{row.SoldQuantity.ToString(CultureInfo.InvariantCulture)}</td>" +
                        $"<td class=\"num\">{row.SalesAmount.ToString("0.00", CultureInfo.InvariantCulture)}</td>" +
                        "</tr>";
                }));

        var sb = new StringBuilder();
        sb.Append("<html><head><style>");
        sb.Append("body{font-family:Arial,Helvetica,sans-serif;background:#f3f7fc;color:#152231;margin:0;padding:18px;}");
        sb.Append(".shell{max-width:1100px;margin:0 auto;background:#ffffff;border:1px solid #d8e2f0;border-radius:14px;overflow:hidden;}");
        sb.Append(".hero{padding:16px 18px;background:linear-gradient(135deg,#0f5ea7,#0d8aa5);color:#ffffff;}");
        sb.Append(".hero h2{margin:0;font-size:22px;line-height:28px;}");
        sb.Append(".hero p{margin:6px 0 0 0;font-size:13px;opacity:.95;}");
        sb.Append(".content{padding:16px 18px;}");
        sb.Append(".meta{width:100%;border-collapse:collapse;margin-bottom:14px;font-size:13px;}");
        sb.Append(".meta td{padding:6px 8px;border:1px solid #d8e2f0;}");
        sb.Append(".meta td:first-child{background:#eef4fc;font-weight:700;width:190px;color:#1f3a54;}");
        sb.Append(".cards{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;}");
        sb.Append(".card{flex:1;min-width:180px;background:#f2f7ff;border:1px solid #d8e2f0;border-radius:9px;padding:10px 8px;}");
        sb.Append(".card-label{font-size:11px;color:#54708c;text-transform:uppercase;letter-spacing:.35px;}");
        sb.Append(".card-value{margin-top:4px;font-size:19px;font-weight:700;color:#16324a;}");
        sb.Append(".variance-up .card-value{color:#8a5a05;}");
        sb.Append(".variance-down .card-value{color:#b4233c;}");
        sb.Append(".variance-balanced .card-value{color:#06795f;}");
        sb.Append(".table-title{font-size:15px;font-weight:700;color:#16324a;margin:2px 0 8px 0;}");
        sb.Append(".report-table{width:100%;border-collapse:collapse;margin-bottom:14px;font-size:13px;}");
        sb.Append(".report-table th,.report-table td{border:1px solid #d8e2f0;padding:8px;}");
        sb.Append(".report-table th{background:#e9f2ff;color:#1c3b5a;text-align:left;}");
        sb.Append(".report-table td{background:#ffffff;color:#1d2f41;}");
        sb.Append(".report-table tbody tr:nth-child(even) td{background:#f8fbff;}");
        sb.Append(".report-table td.num{text-align:right;font-variant-numeric:tabular-nums;}");
        sb.Append(".report-table td.empty{text-align:center;color:#607a93;background:#f8fbff;}");
        sb.Append(".report-table tfoot td{background:#eef6ff;font-weight:700;color:#10263a;}");
        sb.Append(".notes{margin-top:4px;padding:10px;border:1px solid #d8e2f0;background:#f8fbff;border-radius:9px;font-size:13px;color:#1d2f41;}");
        sb.Append("</style></head><body>");
        sb.Append("<div class=\"shell\">");
        sb.Append("<div class=\"hero\">");
        sb.Append("<h2>Scratch Card Day Close Report</h2>");
        sb.Append("</div>");
        sb.Append("<div class=\"content\">");
        sb.Append("<table class=\"meta\"><tbody>");
        sb.Append($"<tr><td>Shop Name</td><td>{WebUtility.HtmlEncode(shopName)}</td></tr>");
        sb.Append($"<tr><td>Business Date</td><td>{day.BusinessDate:yyyy-MM-dd}</td></tr>");
        sb.Append($"<tr><td>Closed Time</td><td>{(day.ClosedOn?.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture) ?? "-")} UTC</td></tr>");
        sb.Append($"<tr><td>Shifts Closed</td><td>{shiftCount}</td></tr>");
        sb.Append("</tbody></table>");
        sb.Append($"<div class=\"cards {differenceClass}\">");
        sb.Append($"<div class=\"card\"><div class=\"card-label\">Total Sales</div><div class=\"card-value\">{day.TotalSalesAmount.ToString("0.00", CultureInfo.InvariantCulture)}</div></div>");
        sb.Append($"<div class=\"card\"><div class=\"card-label\">Total Prize Payout</div><div class=\"card-value\">{day.TotalPrizePayout.ToString("0.00", CultureInfo.InvariantCulture)}</div></div>");
        // sb.Append($"<div class=\"card\"><div class=\"card-label\">Expected Cash</div><div class=\"card-value\">{day.ExpectedCash.ToString("0.00", CultureInfo.InvariantCulture)}</div></div>");
        // sb.Append($"<div class=\"card\"><div class=\"card-label\">Difference</div><div class=\"card-value\">{tillBasedDifference.ToString("0.00", CultureInfo.InvariantCulture)}</div></div>");
        sb.Append("</div>");

        // sb.Append("<div class=\"table-title\">Day Close Metrics</div>");
        // sb.Append("<table class=\"report-table\"><thead><tr>");
        // sb.Append("<th>Metric</th><th class=\"num\">Amount</th>");
        // sb.Append("</tr></thead><tbody>");
        // sb.Append($"<tr><td>Lottery Machine Payout</td><td class=\"num\">{(summary?.LottoPayout ?? 0m).ToString("0.00", CultureInfo.InvariantCulture)}</td></tr>");
        // sb.Append($"<tr><td>Scratch Card Payout</td><td class=\"num\">{(summary?.ScratchCardPayout ?? 0m).ToString("0.00", CultureInfo.InvariantCulture)}</td></tr>");
        // sb.Append($"<tr><td>Till Payout</td><td class=\"num\">{tillPayout.ToString("0.00", CultureInfo.InvariantCulture)}</td></tr>");
        // sb.Append($"<tr><td>Missing Tickets (Opening Serial)</td><td class=\"num\">{missingOpeningTicketCount}</td></tr>");
        // sb.Append("</tbody></table>");

        sb.Append("<div class=\"table-title\">Shift Breakdown</div>");
        sb.Append("<table class=\"report-table\"><thead><tr>");
        sb.Append("<th>Shift</th><th>Start (UTC)</th><th>End (UTC)</th><th class=\"num\">Sales Total</th>");
        sb.Append("</tr></thead><tbody>");
        sb.Append(shiftRowsHtml);
        sb.Append("</tbody></table>");

        sb.Append("<div class=\"table-title\">Scratch Card Sales by Display</div>");
        sb.Append("<table class=\"report-table\"><thead><tr>");
        sb.Append("<th>Display No</th><th>Game Name</th><th class=\"num\">Price</th><th class=\"num\">Sold Qty</th><th class=\"num\">Sales Total</th>");
        sb.Append("</tr></thead><tbody>");
        sb.Append(salesRowsHtml);
        sb.Append("</tbody><tfoot><tr>");
        sb.Append("<td colspan=\"3\" class=\"num\">Total</td>");
        sb.Append($"<td class=\"num\">{totalSoldQty.ToString(CultureInfo.InvariantCulture)}</td>");
        sb.Append($"<td class=\"num\">{totalSales.ToString("0.00", CultureInfo.InvariantCulture)}</td>");
        sb.Append("</tr></tfoot></table>");

        if (!string.IsNullOrWhiteSpace(day.Notes))
        {
            sb.Append("<div class=\"notes\"><strong>Close Notes:</strong> ");
            sb.Append(WebUtility.HtmlEncode(day.Notes));
            sb.Append("</div>");
        }

        sb.Append("</div></div></body></html>");
        return sb.ToString();
    }
}
