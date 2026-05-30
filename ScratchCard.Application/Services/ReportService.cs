using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Models;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Notifications;
using ScratchCard.Application.DTOs.Reports;
using ScratchCard.Application.DTOs.TemperatureLogs;
using ScratchCard.Domain.Entities;

namespace ScratchCard.Application.Services;

public class ReportService : IReportService
{
    private readonly IRepository<BusinessDay> _businessDayRepository;
    private readonly IRepository<Shift> _shiftRepository;
    private readonly IRepository<ShiftReconciliation> _reconciliationRepository;
    private readonly IRepository<ShiftScratchCardSale> _salesRepository;
    private readonly IRepository<ScratchCardPack> _packRepository;
    private readonly IRepository<TemperatureReading> _temperatureReadingRepository;
    private readonly IRepository<CfgTemperatureSchedule> _temperatureScheduleRepository;
    private readonly IRepository<TemperatureMonitoringUnit> _temperatureUnitRepository;
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
        IRepository<TemperatureReading> temperatureReadingRepository,
        IRepository<CfgTemperatureSchedule> temperatureScheduleRepository,
        IRepository<TemperatureMonitoringUnit> temperatureUnitRepository,
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
        _temperatureReadingRepository = temperatureReadingRepository;
        _temperatureScheduleRepository = temperatureScheduleRepository;
        _temperatureUnitRepository = temperatureUnitRepository;
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
                SoldQuantity = x.ShiftSales.Sum(s => s.SoldQuantity),
                SalesAmount = x.ShiftSales.Sum(s => s.SalesAmount),
                PrizePayout = x.PrizePayouts.Sum(p => p.PrizeAmount),
                ExpectedCash = x.ShiftReconciliation != null ? x.ShiftReconciliation.ExpectedCash : 0,
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

    public async Task<IReadOnlyCollection<TemperatureReadingDto>> GetTemperatureLogsReportAsync(
        Guid shopId,
        DateOnly from,
        DateOnly to,
        Guid? unitId = null,
        CancellationToken cancellationToken = default)
    {
        if (from > to)
        {
            throw new AppException("temperature_invalid_range", "From date cannot be after to date.");
        }

        var query = _temperatureReadingRepository.Query()
            .AsNoTracking()
            .Include(x => x.TemperatureMonitoringUnit)
            .Where(x => x.ShopId == shopId && x.ReadingDate >= from && x.ReadingDate <= to);

        if (unitId.HasValue)
        {
            query = query.Where(x => x.TemperatureMonitoringUnitId == unitId.Value);
        }

        var readings = await query
            .OrderByDescending(x => x.ReadingDate)
            .ThenByDescending(x => x.ReadingTime)
            .ToListAsync(cancellationToken);

        return readings.Select(x => x.ToDto()).ToArray();
    }

    public async Task<TemperatureScheduleGridDto> GetTemperatureScheduleGridAsync(
        Guid shopId,
        DateOnly from,
        DateOnly to,
        Guid? unitId = null,
        CancellationToken cancellationToken = default)
    {
        if (from > to)
        {
            throw new AppException("temperature_invalid_range", "From date cannot be after to date.");
        }

        var schedules = await _temperatureScheduleRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && x.IsActive)
            .OrderBy(x => x.ExpectedTime)
            .ThenBy(x => x.Label)
            .ToListAsync(cancellationToken);

        var units = await _temperatureUnitRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && x.IsActive && !x.IsDeleted)
            .OrderBy(x => x.UnitName)
            .Select(x => new TemperatureScheduleGridUnitDto { UnitId = x.Id, UnitName = x.UnitName })
            .ToListAsync(cancellationToken);

        if (unitId.HasValue)
        {
            units = units.Where(u => u.UnitId == unitId.Value).ToList();
        }

        var readingsQuery = _temperatureReadingRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId && x.ReadingDate >= from && x.ReadingDate <= to && x.ScheduleId != null);
        if (unitId.HasValue)
        {
            readingsQuery = readingsQuery.Where(x => x.TemperatureMonitoringUnitId == unitId.Value);
        }
        var readings = await readingsQuery
            .Select(x => new
            {
                x.Id,
                x.TemperatureMonitoringUnitId,
                x.ScheduleId,
                x.ReadingDate,
                x.ReadingTime,
                x.TemperatureCelsius,
                x.IsOutOfRange,
                x.IsLateForSchedule
            })
            .ToListAsync(cancellationToken);

        // Index readings by (date, unit, schedule) so the cell builder is O(1) per slot.
        var readingByKey = readings.ToDictionary(
            r => (r.ReadingDate, r.TemperatureMonitoringUnitId, r.ScheduleId!.Value),
            r => r);

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var nowTime = TimeOnly.FromDateTime(DateTime.UtcNow);

        var cells = new List<TemperatureScheduleGridCellDto>();
        var onTime = 0;
        var late = 0;
        var missed = 0;

        for (var date = from; date <= to; date = date.AddDays(1))
        {
            foreach (var unit in units)
            {
                var applicableSlots = schedules
                    .Where(s => s.TemperatureMonitoringUnitId == null || s.TemperatureMonitoringUnitId == unit.UnitId);

                foreach (var slot in applicableSlots)
                {
                    var cell = new TemperatureScheduleGridCellDto
                    {
                        Date = date,
                        UnitId = unit.UnitId,
                        ScheduleId = slot.Id
                    };

                    if (readingByKey.TryGetValue((date, unit.UnitId, slot.Id), out var reading))
                    {
                        cell.ReadingId = reading.Id;
                        cell.ReadingTime = reading.ReadingTime;
                        cell.TemperatureCelsius = reading.TemperatureCelsius;
                        cell.IsOutOfRange = reading.IsOutOfRange;
                        cell.IsLate = reading.IsLateForSchedule;
                        cell.State = reading.IsLateForSchedule
                            ? TemperatureScheduleCellState.Late
                            : TemperatureScheduleCellState.OnTime;
                        if (cell.State == TemperatureScheduleCellState.Late) late++;
                        else onTime++;
                    }
                    else
                    {
                        // No reading yet — Upcoming if the slot's tolerance window hasn't closed.
                        var slotCutoff = slot.ExpectedTime.ToTimeSpan() + TimeSpan.FromMinutes(slot.ToleranceMinutes);
                        var stillOpen = date > today
                            || (date == today && nowTime.ToTimeSpan() <= slotCutoff);
                        cell.State = stillOpen
                            ? TemperatureScheduleCellState.Upcoming
                            : TemperatureScheduleCellState.Missed;
                        if (cell.State == TemperatureScheduleCellState.Missed) missed++;
                    }

                    cells.Add(cell);
                }
            }
        }

        return new TemperatureScheduleGridDto
        {
            From = from,
            To = to,
            Units = units,
            Slots = schedules.Select(s => new TemperatureScheduleGridSlotDto
            {
                ScheduleId = s.Id,
                UnitId = s.TemperatureMonitoringUnitId,
                Label = s.Label,
                ExpectedTime = s.ExpectedTime,
                ToleranceMinutes = s.ToleranceMinutes
            }).ToArray(),
            Cells = cells,
            OnTimeCount = onTime,
            LateCount = late,
            MissedCount = missed
        };
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
