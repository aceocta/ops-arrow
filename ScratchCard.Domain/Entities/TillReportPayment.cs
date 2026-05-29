using ScratchCard.Domain.Common;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Domain.Entities;

public class TillReportPayment : BaseEntity
{
    public Guid TillReportId { get; set; }
    public Guid? PaymentTypeId { get; set; }
    // Snapshot of the payment type name at the time the report was processed — kept on the row
    // so the figure remains readable even if the configured payment type is later renamed/removed.
    public string PaymentTypeName { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public TillLineSource Source { get; set; } = TillLineSource.Unclassified;

    public TillReport TillReport { get; set; } = null!;
    public ShopPaymentType? PaymentType { get; set; }
}
