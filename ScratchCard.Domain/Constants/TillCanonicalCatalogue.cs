using ScratchCard.Domain.Enums;

namespace ScratchCard.Domain.Constants;

/// <summary>Behaviour metadata for a canonical till field. The reconciliation engine and
/// accounting export read this — never the printed label.</summary>
public sealed record TillFieldMeta(
    TillCanonicalField Field,
    TillFieldGroup Group,
    TillCashDirection CashDirection,
    bool AffectsDrawer,
    TillVatTreatment Vat,
    bool IsCommissionIncome,
    string DisplayName);

/// <summary>
/// The canonical field catalogue. Single source of truth for how each field behaves in
/// reconciliation (cash direction, drawer impact), VAT/accounting, and display.
/// </summary>
public static class TillCanonicalCatalogue
{
    private static TillFieldMeta M(
        TillCanonicalField f, TillFieldGroup g, TillCashDirection dir, bool drawer,
        TillVatTreatment vat, string name, bool commission = false)
        => new(f, g, dir, drawer, vat, commission, name);

    public static readonly IReadOnlyList<TillFieldMeta> All = new[]
    {
        // Tenders
        M(TillCanonicalField.Cash, TillFieldGroup.Tender, TillCashDirection.In, true, TillVatTreatment.NotApplicable, "Cash"),
        M(TillCanonicalField.Card, TillFieldGroup.Tender, TillCashDirection.None, false, TillVatTreatment.NotApplicable, "Card"),
        M(TillCanonicalField.CardDebit, TillFieldGroup.Tender, TillCashDirection.None, false, TillVatTreatment.NotApplicable, "Card (debit)"),
        M(TillCanonicalField.CardCredit, TillFieldGroup.Tender, TillCashDirection.None, false, TillVatTreatment.NotApplicable, "Card (credit)"),
        M(TillCanonicalField.CardContactless, TillFieldGroup.Tender, TillCashDirection.None, false, TillVatTreatment.NotApplicable, "Contactless"),
        M(TillCanonicalField.MobilePay, TillFieldGroup.Tender, TillCashDirection.None, false, TillVatTreatment.NotApplicable, "Mobile pay"),
        M(TillCanonicalField.Voucher, TillFieldGroup.Tender, TillCashDirection.None, false, TillVatTreatment.NotApplicable, "Voucher"),
        M(TillCanonicalField.GiftCard, TillFieldGroup.Tender, TillCashDirection.None, false, TillVatTreatment.NotApplicable, "Gift card"),
        M(TillCanonicalField.AccountCredit, TillFieldGroup.Tender, TillCashDirection.None, false, TillVatTreatment.NotApplicable, "Account / credit"),
        M(TillCanonicalField.Cheque, TillFieldGroup.Tender, TillCashDirection.None, false, TillVatTreatment.NotApplicable, "Cheque"),
        M(TillCanonicalField.Cashback, TillFieldGroup.Tender, TillCashDirection.Out, true, TillVatTreatment.NotApplicable, "Cashback"),

        // Service counters
        M(TillCanonicalField.LotterySales, TillFieldGroup.Counter, TillCashDirection.In, true, TillVatTreatment.Exempt, "Lottery sales"),
        M(TillCanonicalField.LotteryPrizes, TillFieldGroup.Counter, TillCashDirection.Out, true, TillVatTreatment.Exempt, "Lottery prizes paid"),
        M(TillCanonicalField.LotteryCommission, TillFieldGroup.Income, TillCashDirection.None, false, TillVatTreatment.Exempt, "Lottery commission", commission: true),
        M(TillCanonicalField.ScratchcardSales, TillFieldGroup.Counter, TillCashDirection.In, true, TillVatTreatment.Exempt, "Scratchcard sales"),
        M(TillCanonicalField.ScratchcardPrizes, TillFieldGroup.Counter, TillCashDirection.Out, true, TillVatTreatment.Exempt, "Scratchcard prizes paid"),
        M(TillCanonicalField.PayPoint, TillFieldGroup.Counter, TillCashDirection.In, true, TillVatTreatment.OutOfScope, "PayPoint"),
        M(TillCanonicalField.Payzone, TillFieldGroup.Counter, TillCashDirection.In, true, TillVatTreatment.OutOfScope, "Payzone"),
        M(TillCanonicalField.Parcels, TillFieldGroup.Counter, TillCashDirection.None, false, TillVatTreatment.Standard20, "Parcels"),
        M(TillCanonicalField.CarrierBags, TillFieldGroup.Counter, TillCashDirection.In, true, TillVatTreatment.Standard20, "Carrier bags"),
        M(TillCanonicalField.PostOffice, TillFieldGroup.Counter, TillCashDirection.Separate, false, TillVatTreatment.NotApplicable, "Post Office"),
        M(TillCanonicalField.FuelSales, TillFieldGroup.Counter, TillCashDirection.In, true, TillVatTreatment.Standard20, "Fuel sales"),
        M(TillCanonicalField.Atm, TillFieldGroup.Counter, TillCashDirection.Out, true, TillVatTreatment.NotApplicable, "ATM"),

        // Movements
        M(TillCanonicalField.OpeningFloat, TillFieldGroup.Movement, TillCashDirection.In, true, TillVatTreatment.NotApplicable, "Opening float"),
        M(TillCanonicalField.PaidIn, TillFieldGroup.Movement, TillCashDirection.In, true, TillVatTreatment.NotApplicable, "Paid in"),
        M(TillCanonicalField.PaidOut, TillFieldGroup.Movement, TillCashDirection.Out, true, TillVatTreatment.NotApplicable, "Paid out"),
        M(TillCanonicalField.SafeDrop, TillFieldGroup.Movement, TillCashDirection.Out, true, TillVatTreatment.NotApplicable, "Safe drop"),
        M(TillCanonicalField.Pickup, TillFieldGroup.Movement, TillCashDirection.Out, true, TillVatTreatment.NotApplicable, "Pickup"),
        M(TillCanonicalField.Banking, TillFieldGroup.Movement, TillCashDirection.Out, true, TillVatTreatment.NotApplicable, "Banking"),

        // Totals / stats
        M(TillCanonicalField.GrossSales, TillFieldGroup.Total, TillCashDirection.None, false, TillVatTreatment.NotApplicable, "Gross sales"),
        M(TillCanonicalField.NetSales, TillFieldGroup.Total, TillCashDirection.None, false, TillVatTreatment.NotApplicable, "Net sales"),
        M(TillCanonicalField.Vat20, TillFieldGroup.Total, TillCashDirection.None, false, TillVatTreatment.Standard20, "VAT 20%"),
        M(TillCanonicalField.Vat5, TillFieldGroup.Total, TillCashDirection.None, false, TillVatTreatment.Reduced5, "VAT 5%"),
        M(TillCanonicalField.Vat0, TillFieldGroup.Total, TillCashDirection.None, false, TillVatTreatment.Zero, "VAT 0%"),
        M(TillCanonicalField.VatExempt, TillFieldGroup.Total, TillCashDirection.None, false, TillVatTreatment.Exempt, "VAT exempt"),
        M(TillCanonicalField.TotalSales, TillFieldGroup.Total, TillCashDirection.None, false, TillVatTreatment.NotApplicable, "Total sales"),
        M(TillCanonicalField.TransactionCount, TillFieldGroup.Stat, TillCashDirection.None, false, TillVatTreatment.NotApplicable, "Transactions"),
        M(TillCanonicalField.ItemCount, TillFieldGroup.Stat, TillCashDirection.None, false, TillVatTreatment.NotApplicable, "Items"),

        // Exceptions
        M(TillCanonicalField.NoSale, TillFieldGroup.Exception, TillCashDirection.None, false, TillVatTreatment.NotApplicable, "No sale"),
        M(TillCanonicalField.Void, TillFieldGroup.Exception, TillCashDirection.None, false, TillVatTreatment.NotApplicable, "Void"),
        M(TillCanonicalField.Refund, TillFieldGroup.Exception, TillCashDirection.Out, true, TillVatTreatment.NotApplicable, "Refund"),
        M(TillCanonicalField.PriceOverride, TillFieldGroup.Exception, TillCashDirection.None, false, TillVatTreatment.NotApplicable, "Price override"),
        M(TillCanonicalField.Discount, TillFieldGroup.Exception, TillCashDirection.None, false, TillVatTreatment.NotApplicable, "Discount"),
        M(TillCanonicalField.ErrorCorrection, TillFieldGroup.Exception, TillCashDirection.None, false, TillVatTreatment.NotApplicable, "Error correction"),
        M(TillCanonicalField.Training, TillFieldGroup.Exception, TillCashDirection.None, false, TillVatTreatment.NotApplicable, "Training mode"),

        // Departments
        M(TillCanonicalField.DeptTobacco, TillFieldGroup.Department, TillCashDirection.None, false, TillVatTreatment.Standard20, "Tobacco & vapes"),
        M(TillCanonicalField.DeptAlcohol, TillFieldGroup.Department, TillCashDirection.None, false, TillVatTreatment.Standard20, "Alcohol"),
        M(TillCanonicalField.DeptGrocery, TillFieldGroup.Department, TillCashDirection.None, false, TillVatTreatment.NotApplicable, "Grocery"),
        M(TillCanonicalField.DeptSoftDrinks, TillFieldGroup.Department, TillCashDirection.None, false, TillVatTreatment.Standard20, "Soft drinks"),
        M(TillCanonicalField.DeptConfectionery, TillFieldGroup.Department, TillCashDirection.None, false, TillVatTreatment.Standard20, "Confectionery"),
        M(TillCanonicalField.DeptFoodToGo, TillFieldGroup.Department, TillCashDirection.None, false, TillVatTreatment.Standard20, "Food to go"),
        M(TillCanonicalField.DeptNewsMag, TillFieldGroup.Department, TillCashDirection.None, false, TillVatTreatment.Zero, "News & magazines"),
        M(TillCanonicalField.DeptHousehold, TillFieldGroup.Department, TillCashDirection.None, false, TillVatTreatment.Standard20, "Household"),
        M(TillCanonicalField.DeptOther, TillFieldGroup.Department, TillCashDirection.None, false, TillVatTreatment.NotApplicable, "Other"),

        // Control
        M(TillCanonicalField.SubtotalIgnore, TillFieldGroup.Control, TillCashDirection.None, false, TillVatTreatment.NotApplicable, "Ignore (subtotal)"),
        M(TillCanonicalField.Unmapped, TillFieldGroup.Control, TillCashDirection.None, false, TillVatTreatment.NotApplicable, "Unmapped"),
    };

    private static readonly IReadOnlyDictionary<TillCanonicalField, TillFieldMeta> ByField =
        All.ToDictionary(m => m.Field);

    public static TillFieldMeta Meta(TillCanonicalField field) =>
        ByField.TryGetValue(field, out var m) ? m : ByField[TillCanonicalField.Unmapped];
}
