using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.DTOs.StoreSales;

// ---- Requests ----

public class GetOrCreateReconciliationRequest
{
    public Guid ShopId { get; set; }
    public DateOnly BusinessDate { get; set; }
    public Guid? TillId { get; set; }
    public TillReportType ReportType { get; set; } = TillReportType.DayEnd;
    public Guid? ShiftId { get; set; }
    public Guid? BusinessDayId { get; set; }
}

public class SaveReconciliationLineRequest
{
    public Guid ReconciliationId { get; set; }
    public Guid? LineId { get; set; }
    public TillCanonicalField CanonicalField { get; set; }
    public string? Section { get; set; }
    public string? RawLabel { get; set; }
    public decimal? ExtractedAmount { get; set; }
    public decimal VerifiedAmount { get; set; }
    public int? Quantity { get; set; }
    public TillCaptureMethod CaptureMethod { get; set; } = TillCaptureMethod.Manual;
    public TillLineStatus Status { get; set; } = TillLineStatus.Verified;
    public string? Notes { get; set; }
    /// <summary>When true and a raw label is given, the resolver learns this mapping for the till.</summary>
    public bool LearnMapping { get; set; }
}

public class SetCashCountRequest
{
    public Guid ReconciliationId { get; set; }
    public decimal? OpeningFloat { get; set; }
    public decimal CountedCash { get; set; }
    public string? DenominationJson { get; set; }
    public decimal? FloatToCarry { get; set; }
    public decimal? CardCounted { get; set; }
}

public class SetVarianceReasonRequest
{
    public Guid ReconciliationId { get; set; }
    public string ReasonCode { get; set; } = string.Empty;
    public string? Notes { get; set; }
}

// ---- Responses ----

public class TillReconciliationLineDto
{
    public Guid Id { get; set; }
    public TillCanonicalField CanonicalField { get; set; }
    public string FieldName { get; set; } = string.Empty;
    public TillFieldGroup Group { get; set; }
    public string? Section { get; set; }
    public string? RawLabel { get; set; }
    public decimal? ExtractedAmount { get; set; }
    public decimal VerifiedAmount { get; set; }
    public int? Quantity { get; set; }
    public TillCaptureMethod CaptureMethod { get; set; }
    public TillLineStatus Status { get; set; }
    public string? Notes { get; set; }
}

public class ProviderOwedDto
{
    public string Provider { get; set; } = string.Empty;
    public decimal Amount { get; set; }
}

public class TillReconciliationSummaryDto
{
    public decimal CashTender { get; set; }
    public decimal CardTender { get; set; }
    public decimal CommissionIncome { get; set; }
    public List<ProviderOwedDto> OwedToProviders { get; set; } = new();
    public int NoSaleCount { get; set; }
    public decimal Voids { get; set; }
    public decimal Refunds { get; set; }
    public int UnmappedCount { get; set; }
    public int UnverifiedCount { get; set; }
}

public class TillReconciliationDto
{
    public Guid Id { get; set; }
    public Guid ShopId { get; set; }
    public Guid? TillId { get; set; }
    public TillReportType ReportType { get; set; }
    public DateOnly BusinessDate { get; set; }
    public TillReconciliationStatus Status { get; set; }

    public decimal OpeningFloat { get; set; }
    public decimal? CountedCash { get; set; }
    public decimal? FloatToCarry { get; set; }
    public decimal? CardCounted { get; set; }
    public decimal ExpectedCash { get; set; }
    public decimal CashVariance { get; set; }
    public TillVarianceStatus VarianceStatus { get; set; }
    public bool RequiresReason { get; set; }
    public string? VarianceReasonCode { get; set; }
    public string? VarianceNotes { get; set; }

    public DateTimeOffset? ConfirmedOn { get; set; }

    public List<TillReconciliationLineDto> Lines { get; set; } = new();
    public TillReconciliationSummaryDto Summary { get; set; } = new();
}
