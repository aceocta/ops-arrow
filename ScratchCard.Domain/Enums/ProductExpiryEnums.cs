namespace ScratchCard.Domain.Enums;

/// <summary>Derived expiry status of a product batch (computed from days-to-expiry vs the category's
/// reminder rules — never stored).</summary>
public enum ProductExpiryStatus
{
    Safe = 0,
    ExpiringSoon = 1,
    Urgent = 2,
    Expired = 3,
}

/// <summary>Legal date type. Use-by is a safety date (selling past it is an offence in the UK);
/// best-before is a quality date (legal to sell/donate past it).</summary>
public enum ProductDateType
{
    UseBy = 0,
    BestBefore = 1,
}

/// <summary>
/// An action staff can take on an expiring/expired batch. Every action except Dispose is a "save"
/// (kept the item out of the bin); Dispose (and reaching Expired with no action) is the failure the
/// feature exists to reduce.
/// </summary>
public enum ProductExpiryActionType
{
    MoveToFront = 0,
    Discount = 1,
    MarkSold = 2,
    Donate = 3,
    ReturnToSupplier = 4,
    Dispose = 5,
}
