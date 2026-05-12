using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Models;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Notifications;
using ScratchCard.Application.DTOs.Reports;
using ScratchCard.Domain.Entities;

namespace ScratchCard.Application.Services;

public class ReportService : IReportService
{
    private readonly IRepository<BusinessDay> _businessDayRepository;
    private readonly IRepository<Shift> _shiftRepository;
    private readonly IRepository<ShiftReconciliation> _reconciliationRepository;
    private readonly IRepository<ShiftScratchCardSale> _salesRepository;
    private readonly IRepository<ScratchCardPack> _packRepository;
    private readonly IRepository<AuditLog> _auditLogRepository;
    private readonly IRepository<NotificationLog> _notificationRepository;
    private readonly IEmailSender _emailSender;
    private readonly ICurrentUserService _currentUserService;

    public ReportService(
        IRepository<BusinessDay> businessDayRepository,
        IRepository<Shift> shiftRepository,
        IRepository<ShiftReconciliation> reconciliationRepository,
        IRepository<ShiftScratchCardSale> salesRepository,
        IRepository<ScratchCardPack> packRepository,
        IRepository<AuditLog> auditLogRepository,
        IRepository<NotificationLog> notificationRepository,
        IEmailSender emailSender,
        ICurrentUserService currentUserService)
    {
        _businessDayRepository = businessDayRepository;
        _shiftRepository = shiftRepository;
        _reconciliationRepository = reconciliationRepository;
        _salesRepository = salesRepository;
        _packRepository = packRepository;
        _auditLogRepository = auditLogRepository;
        _notificationRepository = notificationRepository;
        _emailSender = emailSender;
        _currentUserService = currentUserService;
    }

    public async Task<IReadOnlyCollection<DailySalesReportRowDto>> GetDailySalesAsync(Guid shopId, DateOnly from, DateOnly to, CancellationToken cancellationToken = default)
    {
        return await _shiftRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && x.BusinessDay.BusinessDate >= from && x.BusinessDay.BusinessDate <= to)
            .Include(x => x.BusinessDay)
            .Select(x => new DailySalesReportRowDto
            {
                BusinessDate = x.BusinessDay.BusinessDate,
                ShiftName = x.ShiftName,
                SalesAmount = x.ShiftSales.Sum(s => s.SalesAmount),
                PrizePayout = x.PrizePayouts.Sum(p => p.PrizeAmount),
                ExpectedCash = x.ShiftReconciliation != null ? x.ShiftReconciliation.ExpectedCash : 0,
                ActualCash = x.ShiftReconciliation != null ? x.ShiftReconciliation.ActualCash : 0,
                Difference = x.ShiftReconciliation != null ? x.ShiftReconciliation.Difference : 0,
                LottoPayout = x.BusinessDay.ScratchCardDayCloseSummary != null ? x.BusinessDay.ScratchCardDayCloseSummary.LottoPayout : null,
                ScratchCardPayout = x.BusinessDay.ScratchCardDayCloseSummary != null ? x.BusinessDay.ScratchCardDayCloseSummary.ScratchCardPayout : null,
                TillPayout = x.BusinessDay.ScratchCardDayCloseSummary != null ? x.BusinessDay.ScratchCardDayCloseSummary.TillPayout : null
            })
            .ToListAsync(cancellationToken);
    }

    public Task<IReadOnlyCollection<DailySalesReportRowDto>> GetShiftSalesAsync(Guid shopId, DateOnly from, DateOnly to, CancellationToken cancellationToken = default)
        => GetDailySalesAsync(shopId, from, to, cancellationToken);

    public async Task<IReadOnlyCollection<ManualEntryReviewRowDto>> GetManualEntryReviewAsync(Guid shopId, DateOnly from, DateOnly to, CancellationToken cancellationToken = default)
    {
        return await _salesRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && x.IsFlaggedForReview && x.Shift.BusinessDay.BusinessDate >= from && x.Shift.BusinessDay.BusinessDate <= to)
            .Include(x => x.Pack)
                .ThenInclude(x => x.Game)
            .Include(x => x.Shift)
                .ThenInclude(x => x.BusinessDay)
            .Include(x => x.Shift)
                .ThenInclude(x => x.ShiftReconciliation)
            .Select(x => new ManualEntryReviewRowDto
            {
                BusinessDate = x.Shift.BusinessDay.BusinessDate,
                ShiftName = x.Shift.ShiftName,
                Cashier = x.EnteredByUserId.ToString(),
                PackNumber = x.Pack.PackNumber,
                GameName = x.Pack.Game.GameName,
                OpeningSerial = x.OpeningSerialNumber,
                OriginalScannedSerial = x.OriginalScannedSerialNumber,
                FinalClosingSerial = x.ClosingSerialNumber,
                EntryMethod = x.EntryMethod.ToString(),
                SoldQuantity = x.SoldQuantity,
                SalesAmount = x.SalesAmount,
                Reason = string.IsNullOrWhiteSpace(x.ManualEntryReason) ? "No reason provided" : x.ManualEntryReason,
                NotificationSent = x.NotificationSent
            })
            .ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyCollection<StockReportRowDto>> GetStockReportAsync(Guid shopId, CancellationToken cancellationToken = default)
    {
        return await _packRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && !x.IsDeleted)
            .Include(x => x.Game)
            .Select(x => new StockReportRowDto
            {
                PackNumber = x.PackNumber,
                GameName = x.Game.GameName,
                Status = x.Status.ToString(),
                CurrentSerialNumber = x.CurrentSerialNumber,
                RemainingTickets = x.TotalTickets
            })
            .ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyCollection<AuditLogReportRowDto>> GetAuditLogReportAsync(Guid shopId, DateOnly from, DateOnly to, CancellationToken cancellationToken = default)
    {
        var fromUtc = new DateTimeOffset(from.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        var toUtc = new DateTimeOffset(to.ToDateTime(TimeOnly.MaxValue), TimeSpan.Zero);

        return await _auditLogRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && x.ChangedOn >= fromUtc && x.ChangedOn <= toUtc)
            .OrderByDescending(x => x.ChangedOn)
            .Select(x => new AuditLogReportRowDto
            {
                Id = x.Id,
                ChangedOn = x.ChangedOn,
                EntityName = x.EntityName,
                EntityId = x.EntityId,
                ActionType = x.ActionType,
                ChangedByUserId = x.ChangedByUserId,
                Reason = x.Reason,
                IpAddress = x.IpAddress
            })
            .ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyCollection<NotificationLogDto>> GetNotificationLogReportAsync(Guid shopId, CancellationToken cancellationToken = default)
    {
        var logs = await _notificationRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId)
            .OrderByDescending(x => x.CreatedOn)
            .ToListAsync(cancellationToken);

        return logs.Select(x => x.ToDto()).ToArray();
    }

    public async Task<IReadOnlyCollection<SyncStatusReportRowDto>> GetSyncStatusReportAsync(Guid shopId, DateOnly from, DateOnly to, CancellationToken cancellationToken = default)
    {
        return await _shiftRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && x.BusinessDay.BusinessDate >= from && x.BusinessDay.BusinessDate <= to)
            .Include(x => x.BusinessDay)
            .Select(x => new SyncStatusReportRowDto
            {
                ShiftId = x.Id,
                ShiftName = x.ShiftName,
                StartTime = x.StartTime,
                EndTime = x.EndTime,
                Status = x.SyncStatus.ToString()
            })
            .ToListAsync(cancellationToken);
    }

    public async Task SendReportByEmailAsync(SendReportEmailRequest request, CancellationToken cancellationToken = default)
    {
        var recipient = string.IsNullOrWhiteSpace(request.RecipientEmail)
            ? _currentUserService.Email
            : request.RecipientEmail.Trim();

        if (string.IsNullOrWhiteSpace(recipient))
        {
            throw new AppException("validation_failed", "Recipient email is required.", 400);
        }

        if (!IsValidEmail(recipient))
        {
            throw new AppException("validation_failed", "Recipient email format is invalid.", 400);
        }

        if (string.IsNullOrWhiteSpace(request.Body))
        {
            throw new AppException("validation_failed", "Report email body is required.", 400);
        }

        var subject = string.IsNullOrWhiteSpace(request.Subject)
            ? "Scratch Card Report"
            : request.Subject.Trim();

        var attachments = BuildAttachments(request);
        await _emailSender.SendAsync(new EmailMessage
        {
            Recipient = recipient,
            Subject = subject,
            Body = request.Body,
            IsBodyHtml = request.IsBodyHtml,
            Attachments = attachments
        }, cancellationToken);
    }

    private static IReadOnlyCollection<EmailAttachment> BuildAttachments(SendReportEmailRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.AttachmentBase64))
        {
            return [];
        }

        byte[] bytes;
        try
        {
            bytes = Convert.FromBase64String(request.AttachmentBase64);
        }
        catch (FormatException)
        {
            throw new AppException("validation_failed", "AttachmentBase64 is not valid base64 content.", 400);
        }

        if (bytes.Length == 0)
        {
            throw new AppException("validation_failed", "Attachment file is empty.", 400);
        }

        const int maxAttachmentSizeBytes = 10 * 1024 * 1024;
        if (bytes.Length > maxAttachmentSizeBytes)
        {
            throw new AppException("validation_failed", "Attachment exceeds 10MB size limit.", 400);
        }

        var fileName = string.IsNullOrWhiteSpace(request.AttachmentFileName)
            ? "report.pdf"
            : request.AttachmentFileName.Trim();

        return
        [
            new EmailAttachment
            {
                FileName = fileName,
                ContentType = "application/pdf",
                Content = bytes
            }
        ];
    }

    private static bool IsValidEmail(string value)
    {
        try
        {
            _ = new System.Net.Mail.MailAddress(value);
            return true;
        }
        catch
        {
            return false;
        }
    }
}
