namespace ScratchCard.Domain.Enums;

/// <summary>
/// The fixed internal vocabulary every printed till/terminal label resolves to. Behaviour
/// (cash direction, drawer impact, VAT) comes from the field's metadata in
/// <see cref="ScratchCard.Domain.Constants.TillCanonicalCatalogue"/> — never from the printed word.
/// Numeric values are grouped in hundreds and must stay stable (persisted).
/// </summary>
public enum TillCanonicalField
{
    Unmapped = 0,

    // --- Tenders (100s) ---
    Cash = 100,
    Card = 101,
    CardDebit = 102,
    CardCredit = 103,
    CardContactless = 104,
    MobilePay = 105,
    Voucher = 106,
    GiftCard = 107,
    AccountCredit = 108,
    Cheque = 109,
    Cashback = 110,

    // --- Service counters (200s) ---
    LotterySales = 200,
    LotteryPrizes = 201,
    LotteryCommission = 202,
    ScratchcardSales = 203,
    ScratchcardPrizes = 204,
    PayPoint = 205,
    Payzone = 206,
    Parcels = 207,
    CarrierBags = 208,
    PostOffice = 209,
    FuelSales = 210,
    Atm = 211,

    // --- Cash movements (300s) ---
    OpeningFloat = 300,
    PaidIn = 301,
    PaidOut = 302,
    SafeDrop = 303,
    Pickup = 304,
    Banking = 305,

    // --- Totals / stats (400s) ---
    GrossSales = 400,
    NetSales = 401,
    Vat20 = 402,
    Vat5 = 403,
    Vat0 = 404,
    VatExempt = 405,
    TotalSales = 406,
    TransactionCount = 407,
    ItemCount = 408,

    // --- Exceptions / risk (500s) ---
    NoSale = 500,
    Void = 501,
    Refund = 502,
    PriceOverride = 503,
    Discount = 504,
    ErrorCorrection = 505,
    Training = 506,
    DriveOff = 507,   // fuel pumped, customer left without paying — a loss

    // --- Departments (600s) ---
    DeptTobacco = 600,
    DeptAlcohol = 601,
    DeptGrocery = 602,
    DeptSoftDrinks = 603,
    DeptConfectionery = 604,
    DeptFoodToGo = 605,
    DeptNewsMag = 606,
    DeptHousehold = 607,
    DeptOther = 608,

    // --- Control ---
    SubtotalIgnore = 900,
}

/// <summary>Which way cash moves for a canonical field (drives the reconciliation equation).</summary>
public enum TillCashDirection
{
    None = 0,
    In = 1,
    Out = 2,
    Separate = 3,
}

/// <summary>High-level grouping for a canonical field.</summary>
public enum TillFieldGroup
{
    Control = 0,
    Tender = 1,
    Counter = 2,
    Movement = 3,
    Total = 4,
    Stat = 5,
    Exception = 6,
    Department = 7,
    Income = 8,
}

/// <summary>VAT treatment of a field for accounting/export purposes.</summary>
public enum TillVatTreatment
{
    NotApplicable = 0,
    Standard20 = 1,
    Reduced5 = 2,
    Zero = 3,
    Exempt = 4,
    OutOfScope = 5,
}

/// <summary>Where a label→field mapping lives. Resolution priority is Till > Shop > Global.</summary>
public enum TillMappingScope
{
    Global = 0,
    Shop = 1,
    Till = 2,
}

/// <summary>How a mapping was established.</summary>
public enum TillMappingSource
{
    Seeded = 0,
    Learned = 1,
    Fuzzy = 2,
    Ai = 3,
    Manual = 4,
}
