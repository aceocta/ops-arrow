namespace ScratchCard.Domain.Entities;

public class CfgPrizePayoutSettings : CfgSettingsBase
{
    public bool? RequirePackNumberForPayout { get; set; }
    public bool? RequireTicketNumberForPayout { get; set; }
    public decimal? CashierPayoutLimit { get; set; }
    public bool? ManagerApprovalAboveLimit { get; set; }
    public bool? PreventDuplicatePayoutForSameTicket { get; set; }
    public string? AllowedPayoutMethods { get; set; }
}
