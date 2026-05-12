namespace ScratchCard.Application.DTOs.BusinessDays;

public class OpenBusinessDayRequest
{
    public Guid ShopId { get; set; }
    public DateOnly BusinessDate { get; set; }
}

public class CloseBusinessDayRequest
{
    public decimal ActualCash { get; set; }
    public decimal LottoPayout { get; set; }
    public decimal ScratchCardPayout { get; set; }
    public decimal TillPayout { get; set; }
    public string? Notes { get; set; }
}

public class ReopenBusinessDayRequest
{
    public string? Reason { get; set; }
}

public class BusinessDayDto
{
    public Guid Id { get; set; }
    public Guid ShopId { get; set; }
    public DateOnly BusinessDate { get; set; }
    public string Status { get; set; } = string.Empty;
    public decimal TotalSalesAmount { get; set; }
    public decimal TotalPrizePayout { get; set; }
    public decimal ExpectedCash { get; set; }
    public decimal ActualCash { get; set; }
    public decimal Difference { get; set; }
    public ScratchCardDayCloseSummaryDto? ScratchCardDayCloseSummary { get; set; }
}

public class ScratchCardDayCloseSummaryDto
{
    public decimal LottoPayout { get; set; }
    public decimal ScratchCardPayout { get; set; }
    public decimal TillPayout { get; set; }
}
