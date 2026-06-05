namespace ScratchCard.Application.DTOs.Reports;

/// <summary>
/// Multi-shop operational roll-up for a company owner/manager: per-shop summaries plus company-wide
/// totals and a count of shops that currently need attention.
/// </summary>
public class OwnerOverviewDto
{
    public DateOnly From { get; set; }
    public DateOnly To { get; set; }
    public IReadOnlyCollection<OwnerShopOverviewDto> Shops { get; set; } = [];

    public int ShopCount { get; set; }
    public decimal TotalSalesAmount { get; set; }
    public decimal PreviousTotalSalesAmount { get; set; } // same-length window immediately before [From, To]
    public decimal TotalCashVariance { get; set; }
    public int ShopsNeedingAttention { get; set; }
    public int TotalOpenComplianceActions { get; set; }
    public int TotalTemperatureIssues { get; set; }
    public int TotalLowStockPacks { get; set; }
    public int TotalRefusals { get; set; }
    public int TotalVisitors { get; set; }
    public int AverageComplianceScore { get; set; } // 0-100 across shops
}

public class OwnerShopOverviewDto
{
    public Guid ShopId { get; set; }
    public string ShopName { get; set; } = string.Empty;

    // Sales & cash
    public decimal SalesAmount { get; set; }
    public decimal PreviousSalesAmount { get; set; } // same-length window immediately before [From, To]
    public decimal CashVariance { get; set; }
    public string DayStatus { get; set; } = "NotStarted"; // NotStarted | Open | Reopened | Closed

    // Compliance & safety
    public int TemperatureChecksDone { get; set; }
    public int TemperatureChecksTotal { get; set; }
    public int TemperatureIssues { get; set; } // late + missed
    public int TemperatureOutOfRangeUnits { get; set; } // distinct units with an out-of-range reading
    public int TemperatureCompliancePercent { get; set; } // 0-100
    public int ComplianceNonCompliantCount { get; set; } // non-compliant checks in range
    public int OpenComplianceActions { get; set; } // non-compliant checks not yet closed out
    public int ComplianceScore { get; set; } // 0-100 blended health score

    // Inventory & risk
    public int ActivePacks { get; set; }
    public int LowStockPacks { get; set; }
    public int Refusals { get; set; }
    public int Visitors { get; set; }

    public bool NeedsAttention { get; set; }
    public IReadOnlyCollection<string> AttentionReasons { get; set; } = [];
}
