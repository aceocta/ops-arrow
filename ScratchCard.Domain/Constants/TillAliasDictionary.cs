using ScratchCard.Domain.Enums;

namespace ScratchCard.Domain.Constants;

/// <summary>
/// Seeded global alias → canonical-field map for common UK EPOS / terminal wording.
/// Keys are already normalized (UPPERCASE, no spaces or punctuation) — match against the same
/// normalization applied to OCR'd labels. This is the Global tier; Till/Shop learned mappings
/// override it. Not exhaustive — the learning loop fills the rest per till.
/// </summary>
public static class TillAliasDictionary
{
    public static readonly IReadOnlyDictionary<string, TillCanonicalField> Seed = Build();

    private static Dictionary<string, TillCanonicalField> Build()
    {
        var map = new Dictionary<string, TillCanonicalField>(StringComparer.Ordinal);

        void Add(TillCanonicalField field, params string[] aliases)
        {
            foreach (var alias in aliases)
            {
                var key = Normalize(alias);
                if (!string.IsNullOrEmpty(key))
                {
                    map[key] = field;
                }
            }
        }

        Add(TillCanonicalField.Cash, "CASH", "CSH", "TOTAL CASH", "CASH SALES", "CASH TAKINGS", "CASH TENDERED", "NOTES AND COIN");
        Add(TillCanonicalField.Card, "CARD", "CARDS", "CREDIT CARD", "DEBIT CARD", "CHIP PIN", "CHIP AND PIN", "EFT", "EFTPOS", "CRDT", "WORLDPAY", "VERIFONE", "INGENICO", "CARD SALES");
        Add(TillCanonicalField.CardContactless, "CTLS", "CONTACTLESS", "TAP");
        Add(TillCanonicalField.MobilePay, "APPLE PAY", "GOOGLE PAY", "MOBILE WALLET", "MOBILE PAY");
        Add(TillCanonicalField.Voucher, "VOUCHER", "VCHR", "COUPON", "STAFF VOUCHER");
        Add(TillCanonicalField.GiftCard, "GIFT CARD", "GIFTCARD");
        Add(TillCanonicalField.Cheque, "CHEQUE", "CHQ");
        Add(TillCanonicalField.Cashback, "CASHBACK", "CSHBK", "CASH BACK");

        Add(TillCanonicalField.LotterySales, "LOTTO", "LOTTERY", "NATIONAL LOTTERY", "NL SALES", "CAMELOT", "ALLWYN", "NLOTT", "LOTTERY SALES");
        Add(TillCanonicalField.LotteryPrizes, "LOTTO PAYOUT", "LOTTERY PRIZE", "NL PRIZES", "PRIZES PAID", "LOTTO WINS", "LOTTERY PAYOUT");
        Add(TillCanonicalField.LotteryCommission, "LOTTERY COMMISSION", "NL COMMISSION", "LOTTO COMM");
        Add(TillCanonicalField.ScratchcardSales, "SCRATCH", "SCRATCHCARD", "SCRATCH CARD", "INSTANTS", "SCRATCHCARDS", "SCR");
        Add(TillCanonicalField.ScratchcardPrizes, "SCRATCH PRIZE", "INSTANT PRIZE", "SCRATCH PAYOUT");

        Add(TillCanonicalField.PayPoint, "PAYPOINT", "PPOINT", "PP", "PP BILLS", "BILL PAY", "BILL PAYMENT", "PAY POINT");
        Add(TillCanonicalField.Payzone, "PAYZONE", "PZ", "PZONE", "PAY ZONE");
        Add(TillCanonicalField.Parcels, "COLLECT PLUS", "COLLECTPLUS", "COLLECT", "AMAZON", "AMZN", "INPOST", "EVRI", "HERMES", "YODEL", "DPD", "PARCEL", "PARCELS");
        Add(TillCanonicalField.CarrierBags, "CARRIER BAG", "BAGS", "BAG LEVY", "CARRIER", "10P BAG", "CARRIER BAGS");
        Add(TillCanonicalField.PostOffice, "POST OFFICE", "PO", "HORIZON");
        Add(TillCanonicalField.FuelSales, "FUEL", "PETROL", "UNLEADED", "DIESEL", "FORECOURT");
        Add(TillCanonicalField.Atm, "ATM", "CASH MACHINE", "CASHPOINT");

        Add(TillCanonicalField.OpeningFloat, "FLOAT", "OPENING FLOAT", "START FLOAT", "OPEN FLOAT", "TILL FLOAT");
        Add(TillCanonicalField.PaidIn, "PAID IN", "PD IN", "PI");
        Add(TillCanonicalField.PaidOut, "PAID OUT", "PD OUT", "PAYOUT", "EXPENSES", "PETTY CASH", "SUPPLIER PAID");
        Add(TillCanonicalField.SafeDrop, "SAFE DROP", "DROP", "CASH DROP", "LIFT", "CASH LIFT", "SKIM");
        Add(TillCanonicalField.Pickup, "PICKUP", "PICK UP");
        Add(TillCanonicalField.Banking, "BANKING", "BANKED", "TO BANK");

        Add(TillCanonicalField.GrossSales, "GROSS", "GROSS SALES", "GROSS TOTAL");
        Add(TillCanonicalField.NetSales, "NET", "NET SALES", "NET TOTAL");
        Add(TillCanonicalField.TotalSales, "TOTAL SALES", "TOTAL", "GRAND TOTAL");
        Add(TillCanonicalField.Vat20, "VAT20", "VAT 20", "STD VAT", "VAT A", "A 20", "STANDARD RATE");
        Add(TillCanonicalField.Vat5, "VAT5", "VAT 5", "REDUCED VAT", "VAT B", "B 5");
        Add(TillCanonicalField.Vat0, "VAT0", "VAT 0", "ZERO RATE", "ZERO VAT", "VAT C", "EXEMPT");
        Add(TillCanonicalField.TransactionCount, "TRANSACTIONS", "TXN", "NO OF SALES", "CUSTOMERS", "NO OF TRANSACTIONS");
        Add(TillCanonicalField.ItemCount, "ITEMS", "ITEMS SOLD", "QTY SOLD");

        Add(TillCanonicalField.NoSale, "NO SALE", "NS", "NO SALES", "DRAWER OPEN");
        Add(TillCanonicalField.Void, "VOID", "VOIDS", "CANCEL", "CANCELLED", "CANCELLATION");
        Add(TillCanonicalField.Refund, "REFUND", "REFUNDS", "RTN", "RETURNS");
        Add(TillCanonicalField.PriceOverride, "OVERRIDE", "PRICE OVERRIDE");
        Add(TillCanonicalField.Discount, "DISCOUNT", "MARKDOWN", "STAFF DISCOUNT");
        Add(TillCanonicalField.Training, "TRAINING", "TRAINING MODE");
        Add(TillCanonicalField.DriveOff, "DRIVE OFF", "DRIVE-OFF", "DRIVEOFF", "NO PAY", "NO-PAY", "NOPAY", "FUEL THEFT", "MADE OFF", "BILK", "BILKING", "DRIVE AWAY");

        Add(TillCanonicalField.DeptTobacco, "TOBACCO", "CIGS", "CIGARETTES", "TOB", "VAPE", "ECIG");
        Add(TillCanonicalField.DeptAlcohol, "ALCOHOL", "BWS", "BEER WINE SPIRITS", "WINE", "BEER", "SPIRITS");
        Add(TillCanonicalField.DeptGrocery, "GROCERY", "GROC", "AMBIENT");
        Add(TillCanonicalField.DeptSoftDrinks, "SOFT DRINKS", "DRINKS", "MINERALS", "POP");
        Add(TillCanonicalField.DeptConfectionery, "CONFECTIONERY", "CONF", "SWEETS", "CHOCOLATE");
        Add(TillCanonicalField.DeptFoodToGo, "FOOD TO GO", "FTG", "HOT FOOD", "CHILLED", "DELI");
        Add(TillCanonicalField.DeptNewsMag, "NEWS", "NEWSPAPERS", "MAGAZINES", "NEWS MAG");
        Add(TillCanonicalField.DeptHousehold, "HOUSEHOLD", "HOMECARE");

        return map;
    }

    /// <summary>Normalize a raw label to a match key: UPPERCASE, strip everything but A–Z/0–9,
    /// and apply common OCR confusions. Mirrors the Application normalizer.</summary>
    public static string Normalize(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return string.Empty;
        var chars = new System.Text.StringBuilder(raw.Length);
        foreach (var ch in raw.Trim().ToUpperInvariant())
        {
            if (ch is >= 'A' and <= 'Z' or >= '0' and <= '9')
            {
                chars.Append(ch);
            }
        }
        return chars.ToString();
    }
}
