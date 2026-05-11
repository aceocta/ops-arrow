using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.Common.Models;

public class ShiftSaleCalculationResult
{
    public string OpeningSerial { get; set; } = string.Empty;
    public string ClosingSerial { get; set; } = string.Empty;
    public SellingOrder SellingOrder { get; set; }
    public int SoldQuantity { get; set; }
    public decimal SalesAmount { get; set; }
    public int RemainingTickets { get; set; }
}
