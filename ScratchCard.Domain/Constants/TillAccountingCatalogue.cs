using ScratchCard.Domain.Enums;

namespace ScratchCard.Domain.Constants;

/// <summary>Maps each canonical field to its bookkeeping ledger category. Enforces the agency rule:
/// PayPoint/Lottery/PO throughput is a liability, commission is income.</summary>
public static class TillAccountingCatalogue
{
    public static LedgerCategory LedgerFor(TillCanonicalField field) => field switch
    {
        // Agency throughput owed to providers — liabilities, never turnover.
        TillCanonicalField.PayPoint or TillCanonicalField.Payzone
            or TillCanonicalField.LotterySales or TillCanonicalField.LotteryPrizes
            or TillCanonicalField.ScratchcardSales or TillCanonicalField.ScratchcardPrizes
            or TillCanonicalField.PostOffice or TillCanonicalField.Atm => LedgerCategory.Liability,

        // Earned commission income.
        TillCanonicalField.LotteryCommission or TillCanonicalField.Parcels => LedgerCategory.Income,

        // Taxable sales.
        TillCanonicalField.CarrierBags or TillCanonicalField.FuelSales => LedgerCategory.Sales,

        // Refunds reduce sales.
        TillCanonicalField.Refund => LedgerCategory.Sales,

        // Paid-outs and drive-off losses are expenses.
        TillCanonicalField.PaidOut or TillCanonicalField.DriveOff => LedgerCategory.Expense,

        _ => field switch
        {
            // Group-based fallback for everything else.
            _ when TillCanonicalCatalogue.Meta(field).Group == TillFieldGroup.Tender => LedgerCategory.Bank,
            _ when TillCanonicalCatalogue.Meta(field).Group == TillFieldGroup.Department => LedgerCategory.Sales,
            _ when TillCanonicalCatalogue.Meta(field).Group == TillFieldGroup.Income => LedgerCategory.Income,
            _ when TillCanonicalCatalogue.Meta(field).Group == TillFieldGroup.Movement => LedgerCategory.Memo,
            _ => LedgerCategory.Ignore,
        },
    };

    /// <summary>VAT rate (%) for a treatment; null for exempt/out-of-scope/not-applicable.</summary>
    public static decimal? VatRate(TillVatTreatment vat) => vat switch
    {
        TillVatTreatment.Standard20 => 20m,
        TillVatTreatment.Reduced5 => 5m,
        TillVatTreatment.Zero => 0m,
        _ => null,
    };

    public static string VatBucket(TillVatTreatment vat) => vat switch
    {
        TillVatTreatment.Standard20 => "Standard (20%)",
        TillVatTreatment.Reduced5 => "Reduced (5%)",
        TillVatTreatment.Zero => "Zero (0%)",
        TillVatTreatment.Exempt => "Exempt",
        TillVatTreatment.OutOfScope => "Outside scope",
        _ => "—",
    };
}
