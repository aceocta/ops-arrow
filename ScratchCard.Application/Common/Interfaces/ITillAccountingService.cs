using ScratchCard.Application.DTOs.StoreSales;

namespace ScratchCard.Application.Common.Interfaces;

/// <summary>Phase 4: accounting export. Aggregates reconciled till data into a correctly-classified
/// journal (right VAT, agency money as a liability not turnover) for CSV / bookkeeping export.</summary>
public interface ITillAccountingService
{
    Task<AccountingSummaryDto> GetSummaryAsync(Guid shopId, DateOnly from, DateOnly to, CancellationToken cancellationToken = default);

    /// <summary>A daily-journal CSV (UTF-8 with BOM) for the period.</summary>
    Task<byte[]> ExportCsvAsync(Guid shopId, DateOnly from, DateOnly to, CancellationToken cancellationToken = default);
}
