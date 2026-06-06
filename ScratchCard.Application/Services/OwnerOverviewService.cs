using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.ComplianceChecks;
using ScratchCard.Application.DTOs.Reports;
using ScratchCard.Domain.Entities;

namespace ScratchCard.Application.Services;

/// <summary>
/// Builds the company owner/manager multi-shop overview by rolling up the existing per-shop reports
/// across every shop the current user belongs to. Each metric is gathered defensively so one shop's
/// missing feature/data never breaks the whole dashboard.
/// </summary>
public class OwnerOverviewService : IOwnerOverviewService
{
    private const int LowStockTicketThreshold = 10;
    private const decimal CashVarianceAlertThreshold = 5m;

    private readonly ICurrentUserService _currentUserService;
    private readonly IRepository<ShopUser> _shopUserRepository;
    private readonly IRepository<ShiftAttendance> _attendanceRepository;
    private readonly IReportService _reportService;
    private readonly IBusinessDayService _businessDayService;
    private readonly IComplianceCheckService _complianceCheckService;
    private readonly IRefusalRegisterService _refusalRegisterService;
    private readonly IVisitorLogService _visitorLogService;

    public OwnerOverviewService(
        ICurrentUserService currentUserService,
        IRepository<ShopUser> shopUserRepository,
        IReportService reportService,
        IBusinessDayService businessDayService,
        IComplianceCheckService complianceCheckService,
        IRefusalRegisterService refusalRegisterService,
        IVisitorLogService visitorLogService,
        IRepository<ShiftAttendance> attendanceRepository)
    {
        _currentUserService = currentUserService;
        _shopUserRepository = shopUserRepository;
        _reportService = reportService;
        _businessDayService = businessDayService;
        _complianceCheckService = complianceCheckService;
        _refusalRegisterService = refusalRegisterService;
        _visitorLogService = visitorLogService;
        _attendanceRepository = attendanceRepository;
    }

    public async Task<OwnerOverviewDto> GetAsync(DateOnly from, DateOnly to, CancellationToken cancellationToken = default)
    {
        var userId = _currentUserService.UserId
            ?? throw new AppException("unauthorized", "No authenticated user.", 401);

        var shops = await _shopUserRepository.Query()
            .AsNoTracking()
            .Where(x => x.UserId == userId && x.IsActive && !x.Shop.IsDeleted)
            .Select(x => new { x.ShopId, x.Shop.ShopName })
            .Distinct()
            .OrderBy(x => x.ShopName)
            .ToListAsync(cancellationToken);

        // Same-length window immediately before the selected range, for period-over-period comparison.
        var lengthDays = to.DayNumber - from.DayNumber + 1;
        var prevTo = from.AddDays(-1);
        var prevFrom = prevTo.AddDays(-(lengthDays - 1));

        var shopSummaries = new List<OwnerShopOverviewDto>(shops.Count);
        var salesByDate = new Dictionary<DateOnly, decimal>();
        var tempInRangeByDate = new Dictionary<DateOnly, int>();
        var tempOutOfRangeByDate = new Dictionary<DateOnly, int>();
        foreach (var shop in shops)
        {
            shopSummaries.Add(await BuildShopSummaryAsync(shop.ShopId, shop.ShopName, from, to, prevFrom, prevTo, salesByDate, tempInRangeByDate, tempOutOfRangeByDate, cancellationToken));
        }

        // One point per day in range (zeros filled in) so the client can render a continuous chart.
        var salesByDay = new List<OwnerSalesPointDto>();
        var temperatureByDay = new List<OwnerTemperaturePointDto>();
        for (var d = from; d <= to; d = d.AddDays(1))
        {
            salesByDay.Add(new OwnerSalesPointDto { Date = d, Amount = salesByDate.GetValueOrDefault(d) });
            temperatureByDay.Add(new OwnerTemperaturePointDto
            {
                Date = d,
                InRange = tempInRangeByDate.GetValueOrDefault(d),
                OutOfRange = tempOutOfRangeByDate.GetValueOrDefault(d),
            });
        }

        return new OwnerOverviewDto
        {
            From = from,
            To = to,
            Shops = shopSummaries,
            ShopCount = shopSummaries.Count,
            TotalSalesAmount = shopSummaries.Sum(x => x.SalesAmount),
            PreviousTotalSalesAmount = shopSummaries.Sum(x => x.PreviousSalesAmount),
            TotalCashVariance = shopSummaries.Sum(x => x.CashVariance),
            ShopsNeedingAttention = shopSummaries.Count(x => x.NeedsAttention),
            TotalOpenComplianceActions = shopSummaries.Sum(x => x.OpenComplianceActions),
            TotalTemperatureIssues = shopSummaries.Sum(x => x.TemperatureIssues),
            TotalLowStockPacks = shopSummaries.Sum(x => x.LowStockPacks),
            TotalRefusals = shopSummaries.Sum(x => x.Refusals),
            TotalVisitors = shopSummaries.Sum(x => x.Visitors),
            TotalOnShiftNow = shopSummaries.Sum(x => x.OnShiftNow),
            AverageComplianceScore = shopSummaries.Count > 0
                ? (int)Math.Round(shopSummaries.Average(x => x.ComplianceScore))
                : 100,
            SalesByDay = salesByDay,
            TemperatureByDay = temperatureByDay,
        };
    }

    private async Task<OwnerShopOverviewDto> BuildShopSummaryAsync(
        Guid shopId,
        string shopName,
        DateOnly from,
        DateOnly to,
        DateOnly prevFrom,
        DateOnly prevTo,
        Dictionary<DateOnly, decimal> salesByDate,
        Dictionary<DateOnly, int> tempInRangeByDate,
        Dictionary<DateOnly, int> tempOutOfRangeByDate,
        CancellationToken cancellationToken)
    {
        // Day status comes from the business-day roll-up (its TotalSalesAmount mixes in till/store
        // sales, so we don't use it for the sales figure).
        var days = await SafeAsync(
            () => _businessDayService.ListAsync(shopId, from, to, cancellationToken),
            Array.Empty<DTOs.BusinessDays.BusinessDayDto>() as IReadOnlyCollection<DTOs.BusinessDays.BusinessDayDto>);
        var dayStatus = days
            .Where(d => d.BusinessDate == to)
            .Select(d => d.Status)
            .FirstOrDefault()
            ?? (days.Count > 0 ? days.OrderByDescending(d => d.BusinessDate).First().Status : "NotStarted");

        // Sales = scratch-card shift sales only (excludes till/store sales); cash variance comes from
        // the scratch-card shift reconciliations.
        var dailySales = await SafeAsync(
            () => _reportService.GetDailySalesAsync(shopId, from, to, cancellationToken),
            Array.Empty<DailySalesReportRowDto>() as IReadOnlyCollection<DailySalesReportRowDto>);
        var salesAmount = dailySales.Sum(r => r.SalesAmount);
        var cashVariance = dailySales.Sum(r => r.Difference);
        foreach (var row in dailySales)
        {
            salesByDate[row.BusinessDate] = salesByDate.GetValueOrDefault(row.BusinessDate) + row.SalesAmount;
        }

        // Previous-period scratch-card sales for the trend indicator.
        var prevSales = await SafeAsync(
            () => _reportService.GetDailySalesAsync(shopId, prevFrom, prevTo, cancellationToken),
            Array.Empty<DailySalesReportRowDto>() as IReadOnlyCollection<DailySalesReportRowDto>);
        var previousSalesAmount = prevSales.Sum(r => r.SalesAmount);

        // Temperature compliance from the schedule grid counts.
        var grid = await SafeAsync(
            () => _reportService.GetTemperatureScheduleGridAsync(shopId, from, to, null, cancellationToken),
            null as DTOs.TemperatureLogs.TemperatureScheduleGridDto);
        var onTime = grid?.OnTimeCount ?? 0;
        var early = grid?.EarlyCount ?? 0;
        var late = grid?.LateCount ?? 0;
        var missed = grid?.MissedCount ?? 0;
        var tempTotal = onTime + early + late + missed;
        var tempDone = onTime + early + late;
        var tempIssues = late + missed;
        var tempPercent = tempTotal > 0 ? (int)Math.Round((decimal)(onTime + early) / tempTotal * 100m) : 100;
        var outOfRangeUnits = grid?.Cells
            .Where(c => c.IsOutOfRange == true)
            .Select(c => c.UnitId)
            .Distinct()
            .Count() ?? 0;

        // Per-day in-range vs out-of-range from EVERY temperature reading taken that day (the overall
        // record for the day — not the per-slot grid representative). Each reading carries IsOutOfRange,
        // computed against its unit's safe range when it was logged.
        var readings = await SafeAsync(
            () => _reportService.GetTemperatureLogsReportAsync(shopId, from, to, null, cancellationToken),
            Array.Empty<DTOs.TemperatureLogs.TemperatureReadingDto>() as IReadOnlyCollection<DTOs.TemperatureLogs.TemperatureReadingDto>);
        foreach (var reading in readings)
        {
            if (reading.IsOutOfRange)
            {
                tempOutOfRangeByDate[reading.ReadingDate] = tempOutOfRangeByDate.GetValueOrDefault(reading.ReadingDate) + 1;
            }
            else
            {
                tempInRangeByDate[reading.ReadingDate] = tempInRangeByDate.GetValueOrDefault(reading.ReadingDate) + 1;
            }
        }

        // Compliance: all non-compliant checks in range, and how many of those are still open.
        var actions = await SafeAsync(
            () => _complianceCheckService.GetActionReportAsync(shopId, from, to, false, cancellationToken),
            Array.Empty<ComplianceActionReportRowDto>() as IReadOnlyCollection<ComplianceActionReportRowDto>);
        var nonCompliantCount = actions.Count;
        var openActions = actions.Count(a => !a.IsActionClosedOut);

        // Pack inventory.
        var stock = await SafeAsync(
            () => _reportService.GetStockReportAsync(shopId, cancellationToken),
            Array.Empty<StockReportRowDto>() as IReadOnlyCollection<StockReportRowDto>);
        var activePacks = stock.Count(s => string.Equals(s.Status, "Active", StringComparison.OrdinalIgnoreCase));
        var lowStock = stock.Count(s =>
            string.Equals(s.Status, "Active", StringComparison.OrdinalIgnoreCase)
            && s.RemainingTickets <= LowStockTicketThreshold);

        // Refusals in range.
        var refusals = await SafeAsync(
            () => _refusalRegisterService.ListEntriesByRangeAsync(shopId, from, to, cancellationToken),
            Array.Empty<DTOs.RefusalRegister.RefusalRegisterEntryDto>() as IReadOnlyCollection<DTOs.RefusalRegister.RefusalRegisterEntryDto>);
        var refusalCount = refusals.Count;

        // Visitors in range.
        var visitors = await SafeAsync(
            () => _visitorLogService.ListEntriesByRangeAsync(shopId, from, to, cancellationToken),
            Array.Empty<DTOs.VisitorLog.VisitorLogEntryDto>() as IReadOnlyCollection<DTOs.VisitorLog.VisitorLogEntryDto>);
        var visitorCount = visitors.Count;

        // Staff currently on shift (checked in, not yet out).
        var onShiftNow = await SafeAsync(
            () => _attendanceRepository.Query().CountAsync(a => a.ShopId == shopId && a.CheckOutAt == null, cancellationToken),
            0);

        // Blended compliance health score (0-100): temperature compliance is the backbone (70%),
        // with the remaining 30% earned by having no open corrective actions.
        var actionsFactor = openActions == 0 ? 1m : openActions <= 2 ? 0.5m : 0m;
        var complianceScore = (int)Math.Round(tempPercent * 0.7m + actionsFactor * 30m);
        complianceScore = Math.Clamp(complianceScore, 0, 100);

        var reasons = new List<string>();
        if (tempIssues > 0) reasons.Add($"{tempIssues} temperature check{(tempIssues == 1 ? "" : "s")} late/missed");
        if (outOfRangeUnits > 0) reasons.Add($"{outOfRangeUnits} unit{(outOfRangeUnits == 1 ? "" : "s")} with out-of-range readings");
        if (nonCompliantCount > 0) reasons.Add($"{nonCompliantCount} non-compliant check{(nonCompliantCount == 1 ? "" : "s")}");
        if (openActions > 0) reasons.Add($"{openActions} open compliance action{(openActions == 1 ? "" : "s")}");
        if (lowStock > 0) reasons.Add($"{lowStock} pack{(lowStock == 1 ? "" : "s")} low on stock");
        if (Math.Abs(cashVariance) >= CashVarianceAlertThreshold)
        {
            reasons.Add($"Cash {(cashVariance < 0 ? "short" : "over")} {Math.Abs(cashVariance):0.00}");
        }

        return new OwnerShopOverviewDto
        {
            ShopId = shopId,
            ShopName = shopName,
            SalesAmount = salesAmount,
            PreviousSalesAmount = previousSalesAmount,
            CashVariance = cashVariance,
            DayStatus = dayStatus,
            TemperatureChecksDone = tempDone,
            TemperatureChecksTotal = tempTotal,
            TemperatureIssues = tempIssues,
            TemperatureOutOfRangeUnits = outOfRangeUnits,
            TemperatureCompliancePercent = tempPercent,
            ComplianceNonCompliantCount = nonCompliantCount,
            OpenComplianceActions = openActions,
            ComplianceScore = complianceScore,
            ActivePacks = activePacks,
            LowStockPacks = lowStock,
            Refusals = refusalCount,
            Visitors = visitorCount,
            OnShiftNow = onShiftNow,
            NeedsAttention = reasons.Count > 0,
            AttentionReasons = reasons,
        };
    }

    private static async Task<T> SafeAsync<T>(Func<Task<T>> action, T fallback)
    {
        try
        {
            return await action();
        }
        catch
        {
            // A shop missing a feature/data must not break the whole overview.
            return fallback;
        }
    }
}
