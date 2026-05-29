using ScratchCard.Domain.Common;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Domain.Entities;

public class TillReportPayment : BaseEntity
{
    public Guid TillReportId { get; set; }
    public TillPaymentType PaymentType { get; set; }
    public decimal Amount { get; set; }
    public TillLineSource Source { get; set; } = TillLineSource.Unclassified;

    public TillReport TillReport { get; set; } = null!;
}
