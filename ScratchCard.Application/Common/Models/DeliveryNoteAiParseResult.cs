namespace ScratchCard.Application.Common.Models;

public class DeliveryNoteAiParseResult
{
    public string SupplierName { get; set; } = "The National Lottery";
    public string ShipmentNumber { get; set; } = string.Empty;
    public string DeliveryReference { get; set; } = string.Empty;
    public string DeliveryDateText { get; set; } = string.Empty;
    public IReadOnlyCollection<DeliveryNoteAiPair> Pairs { get; set; } = [];
}

public class DeliveryNoteAiPair
{
    public string GameCode { get; set; } = string.Empty;
    public string GameName { get; set; } = string.Empty;
    public string PackNumber { get; set; } = string.Empty;
    public decimal? PricePoint { get; set; }
    public string RawText { get; set; } = string.Empty;
    public decimal Confidence { get; set; }
}
