namespace ScratchCard.Application.DTOs.PrizePayouts;

public class CreatePrizePayoutRequest
{
    public Guid ShopId { get; set; }
    public Guid BusinessDayId { get; set; }
    public Guid ShiftId { get; set; }
    public Guid? PackId { get; set; }
    public string? TicketNumber { get; set; }
    public decimal PrizeAmount { get; set; }
    public string PaymentMethod { get; set; } = "Cash";
    public string? Notes { get; set; }
}

public class ApprovePrizePayoutRequest
{
    public string? Notes { get; set; }
}

public class PrizePayoutDto
{
    public Guid Id { get; set; }
    public Guid ShiftId { get; set; }
    public Guid? PackId { get; set; }
    public string? TicketNumber { get; set; }
    public decimal PrizeAmount { get; set; }
    public string ApprovalStatus { get; set; } = string.Empty;
    public DateTimeOffset PaidOn { get; set; }
}
