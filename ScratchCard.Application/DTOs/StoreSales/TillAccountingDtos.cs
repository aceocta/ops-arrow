using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.DTOs.StoreSales;

public class AccountingLineDto
{
    public TillCanonicalField Field { get; set; }
    public string FieldName { get; set; } = string.Empty;
    public LedgerCategory Ledger { get; set; }
    public string VatBucket { get; set; } = string.Empty;
    public decimal Amount { get; set; }
}

public class VatRateRowDto
{
    public string Bucket { get; set; } = string.Empty;
    public decimal Net { get; set; }
    public decimal Vat { get; set; }
    public decimal Gross { get; set; }
}

public class AccountingSummaryDto
{
    public Guid ShopId { get; set; }
    public DateOnly From { get; set; }
    public DateOnly To { get; set; }

    /// <summary>Taxable turnover, excluding agency throughput.</summary>
    public decimal TurnoverExAgency { get; set; }
    public decimal TendersTotal { get; set; }
    public decimal CommissionIncome { get; set; }
    public decimal AgencyLiabilities { get; set; }
    public decimal Expenses { get; set; }
    public decimal CashOverShort { get; set; }

    public List<VatRateRowDto> VatByRate { get; set; } = new();
    public List<AccountingLineDto> Lines { get; set; } = new();
}
