using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.DTOs.StoreSales;

// ---- Post Office balance ----

public class PostOfficeBalanceDto
{
    public Guid Id { get; set; }
    public Guid ShopId { get; set; }
    public DateOnly BusinessDate { get; set; }
    public decimal OpeningBalance { get; set; }
    public decimal CashIn { get; set; }
    public decimal CashOut { get; set; }
    public decimal ExpectedBalance { get; set; }
    public decimal? CountedBalance { get; set; }
    public decimal Variance { get; set; }
    public TillVarianceStatus VarianceStatus { get; set; }
    public string? Notes { get; set; }
    public TillReconciliationStatus Status { get; set; }
    public DateTimeOffset? ConfirmedOn { get; set; }
}

public class GetOrCreatePostOfficeRequest
{
    public Guid ShopId { get; set; }
    public DateOnly BusinessDate { get; set; }
}

public class SavePostOfficeRequest
{
    public Guid Id { get; set; }
    public decimal OpeningBalance { get; set; }
    public decimal CashIn { get; set; }
    public decimal CashOut { get; set; }
    public decimal? CountedBalance { get; set; }
    public string? Notes { get; set; }
}

// ---- Provider settlement ----

public class ProviderSettlementDto
{
    public Guid Id { get; set; }
    public Guid ShopId { get; set; }
    public SettlementProvider Provider { get; set; }
    public DateOnly PeriodStart { get; set; }
    public DateOnly PeriodEnd { get; set; }
    public decimal CapturedSales { get; set; }
    public decimal CapturedPrizes { get; set; }
    public decimal CapturedCommission { get; set; }
    public decimal CapturedOwed { get; set; }
    public decimal? StatementAmount { get; set; }
    public decimal? StatementCommission { get; set; }
    public decimal? DdAmount { get; set; }
    public DateOnly? DdDate { get; set; }
    public decimal Variance { get; set; }
    public SettlementStatus Status { get; set; }
    public string? Notes { get; set; }
}

public class GetOrCreateSettlementRequest
{
    public Guid ShopId { get; set; }
    public SettlementProvider Provider { get; set; }
    public DateOnly PeriodStart { get; set; }
    public DateOnly PeriodEnd { get; set; }
}

public class SetStatementRequest
{
    public Guid Id { get; set; }
    public decimal? StatementAmount { get; set; }
    public decimal? StatementCommission { get; set; }
    public decimal? DdAmount { get; set; }
    public DateOnly? DdDate { get; set; }
    public string? Notes { get; set; }
}
