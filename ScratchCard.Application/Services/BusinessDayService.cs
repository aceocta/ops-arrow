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
        var recipients = await _shopUserRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == day.ShopId && x.IsActive && x.Role.Name == RoleNames.ShopOwner)
            .Include(x => x.Role)
            .Include(x => x.User)
            .Select(x => x.User.Email)
            .Distinct()
            .ToListAsync(cancellationToken);

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

        var sb = new StringBuilder();
        sb.Append("<html><body style=\"font-family:Arial,Helvetica,sans-serif;color:#172033;\">");
        sb.Append("<h3 style=\"margin:0 0 8px 0;\">Day Close Summary</h3>");
        sb.Append("<div style=\"margin-bottom:12px;\">");
        sb.Append($"<div><strong>Shop:</strong> {WebUtility.HtmlEncode(shopName)}</div>");
        sb.Append($"<div><strong>Business Date:</strong> {day.BusinessDate:yyyy-MM-dd}</div>");
        sb.Append($"<div><strong>Closed Time (UTC):</strong> {(day.ClosedOn?.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture) ?? "-")}</div>");
        sb.Append($"<div><strong>Shifts Closed:</strong> {shiftCount}</div>");
        sb.Append("</div>");

        sb.Append("<table style=\"border-collapse:collapse;width:100%;font-size:13px;margin-bottom:12px;\">");
        sb.Append("<thead><tr style=\"background:#EEF3FB;\">");
        sb.Append("<th style=\"border:1px solid #C7D2E3;padding:6px;text-align:left;\">Metric</th>");
        sb.Append("<th style=\"border:1px solid #C7D2E3;padding:6px;text-align:right;\">Amount</th>");
        sb.Append("</tr></thead><tbody>");
        sb.Append($"<tr><td style=\"border:1px solid #C7D2E3;padding:6px;\">Total Sales</td><td style=\"border:1px solid #C7D2E3;padding:6px;text-align:right;\">{day.TotalSalesAmount.ToString("0.00", CultureInfo.InvariantCulture)}</td></tr>");
        sb.Append($"<tr><td style=\"border:1px solid #C7D2E3;padding:6px;\">Total Prize Payout</td><td style=\"border:1px solid #C7D2E3;padding:6px;text-align:right;\">{day.TotalPrizePayout.ToString("0.00", CultureInfo.InvariantCulture)}</td></tr>");
        sb.Append($"<tr><td style=\"border:1px solid #C7D2E3;padding:6px;\">Expected Cash</td><td style=\"border:1px solid #C7D2E3;padding:6px;text-align:right;\">{day.ExpectedCash.ToString("0.00", CultureInfo.InvariantCulture)}</td></tr>");
        sb.Append($"<tr><td style=\"border:1px solid #C7D2E3;padding:6px;\">Difference (Till Payout - Expected Cash)</td><td style=\"border:1px solid #C7D2E3;padding:6px;text-align:right;\">{tillBasedDifference.ToString("0.00", CultureInfo.InvariantCulture)}</td></tr>");
        sb.Append($"<tr><td style=\"border:1px solid #C7D2E3;padding:6px;\">Lottery Machine Payout</td><td style=\"border:1px solid #C7D2E3;padding:6px;text-align:right;\">{(summary?.LottoPayout ?? 0m).ToString("0.00", CultureInfo.InvariantCulture)}</td></tr>");
        sb.Append($"<tr><td style=\"border:1px solid #C7D2E3;padding:6px;\">Scratch Card Payout</td><td style=\"border:1px solid #C7D2E3;padding:6px;text-align:right;\">{(summary?.ScratchCardPayout ?? 0m).ToString("0.00", CultureInfo.InvariantCulture)}</td></tr>");
        sb.Append($"<tr><td style=\"border:1px solid #C7D2E3;padding:6px;\">Till Payout</td><td style=\"border:1px solid #C7D2E3;padding:6px;text-align:right;\">{tillPayout.ToString("0.00", CultureInfo.InvariantCulture)}</td></tr>");
        sb.Append($"<tr><td style=\"border:1px solid #C7D2E3;padding:6px;\">Missing Tickets (Opening Serial)</td><td style=\"border:1px solid #C7D2E3;padding:6px;text-align:right;\">{missingOpeningTicketCount}</td></tr>");
        sb.Append("</tbody></table>");

        sb.Append("<h4 style=\"margin:0 0 8px 0;\">Shift Breakdown</h4>");
        sb.Append("<table style=\"border-collapse:collapse;width:100%;font-size:13px;margin-bottom:12px;\">");
        sb.Append("<thead><tr style=\"background:#EEF3FB;\">");
        sb.Append("<th style=\"border:1px solid #C7D2E3;padding:6px;text-align:left;\">Shift</th>");
        sb.Append("<th style=\"border:1px solid #C7D2E3;padding:6px;text-align:left;\">Start (UTC)</th>");
        sb.Append("<th style=\"border:1px solid #C7D2E3;padding:6px;text-align:left;\">End (UTC)</th>");
        sb.Append("<th style=\"border:1px solid #C7D2E3;padding:6px;text-align:right;\">Sales Total</th>");
        sb.Append("</tr></thead><tbody>");
        if (orderedShifts.Length == 0)
        {
            sb.Append("<tr><td colspan=\"4\" style=\"border:1px solid #C7D2E3;padding:8px;text-align:center;\">No shifts found.</td></tr>");
        }
        else
        {
            foreach (var shift in orderedShifts)
            {
                var shiftSales = shiftSalesById.TryGetValue(shift.Id, out var total) ? total : 0m;
                sb.Append("<tr>");
                sb.Append($"<td style=\"border:1px solid #C7D2E3;padding:6px;\">{WebUtility.HtmlEncode(shift.ShiftName)}</td>");
                sb.Append($"<td style=\"border:1px solid #C7D2E3;padding:6px;\">{shift.StartTime.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture)}</td>");
                sb.Append($"<td style=\"border:1px solid #C7D2E3;padding:6px;\">{(shift.EndTime?.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture) ?? "-")}</td>");
                sb.Append($"<td style=\"border:1px solid #C7D2E3;padding:6px;text-align:right;\">{shiftSales.ToString("0.00", CultureInfo.InvariantCulture)}</td>");
                sb.Append("</tr>");
            }
        }
        sb.Append("</tbody></table>");

        sb.Append("<h4 style=\"margin:0 0 8px 0;\">Scratch Card Sales by Display</h4>");
        sb.Append("<table style=\"border-collapse:collapse;width:100%;font-size:13px;\">");
        sb.Append("<thead><tr style=\"background:#EEF3FB;\">");
        sb.Append("<th style=\"border:1px solid #C7D2E3;padding:6px;text-align:left;\">Display No</th>");
        sb.Append("<th style=\"border:1px solid #C7D2E3;padding:6px;text-align:left;\">Game Name</th>");
        sb.Append("<th style=\"border:1px solid #C7D2E3;padding:6px;text-align:right;\">Price</th>");
        sb.Append("<th style=\"border:1px solid #C7D2E3;padding:6px;text-align:right;\">Sold Qty</th>");
        sb.Append("<th style=\"border:1px solid #C7D2E3;padding:6px;text-align:right;\">Sales Total</th>");
        sb.Append("</tr></thead><tbody>");
        if (rows.Length == 0)
        {
            sb.Append("<tr><td colspan=\"5\" style=\"border:1px solid #C7D2E3;padding:8px;text-align:center;\">No shift entries.</td></tr>");
        }
        else
        {
            foreach (var row in rows)
            {
                sb.Append("<tr>");
                sb.Append($"<td style=\"border:1px solid #C7D2E3;padding:6px;\">{(row.DisplayNumber.HasValue ? row.DisplayNumber.Value.ToString(CultureInfo.InvariantCulture) : "-")}</td>");
                sb.Append($"<td style=\"border:1px solid #C7D2E3;padding:6px;\">{WebUtility.HtmlEncode(row.GameName)}</td>");
                sb.Append($"<td style=\"border:1px solid #C7D2E3;padding:6px;text-align:right;\">{row.TicketPrice.ToString("0.00", CultureInfo.InvariantCulture)}</td>");
                sb.Append($"<td style=\"border:1px solid #C7D2E3;padding:6px;text-align:right;\">{row.SoldQuantity}</td>");
                sb.Append($"<td style=\"border:1px solid #C7D2E3;padding:6px;text-align:right;\">{row.SalesAmount.ToString("0.00", CultureInfo.InvariantCulture)}</td>");
                sb.Append("</tr>");
            }
        }

        sb.Append("<tr style=\"background:#F5F8FD;font-weight:700;\">");
        sb.Append("<td colspan=\"3\" style=\"border:1px solid #C7D2E3;padding:6px;text-align:right;\">Total</td>");
        sb.Append($"<td style=\"border:1px solid #C7D2E3;padding:6px;text-align:right;\">{totalSoldQty}</td>");
        sb.Append($"<td style=\"border:1px solid #C7D2E3;padding:6px;text-align:right;\">{totalSales.ToString("0.00", CultureInfo.InvariantCulture)}</td>");
        sb.Append("</tr>");

        sb.Append("</tbody></table>");

        if (!string.IsNullOrWhiteSpace(day.Notes))
        {
            sb.Append("<div style=\"margin-top:12px;\">");
            sb.Append("<strong>Close Notes:</strong> ");
            sb.Append(WebUtility.HtmlEncode(day.Notes));
            sb.Append("</div>");
        }

        sb.Append("</body></html>");
        return sb.ToString();
    }
}
