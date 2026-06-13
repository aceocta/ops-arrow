using ScratchCard.Domain.Common;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Domain.Entities;

/// <summary>
/// Per-shop override of a canonical till field's classification. Any null field falls back to the
/// built-in <see cref="ScratchCard.Domain.Constants.TillCanonicalCatalogue"/> / accounting defaults,
/// so a shop only stores the bits it wants to change (e.g. make "Discount" reduce Sales).
/// </summary>
public class TillFieldOverride : SoftDeletableAuditableEntity
{
    public Guid ShopId { get; set; }
    public TillCanonicalField CanonicalField { get; set; }

    /// <summary>Override the reconciliation group / section, by group code (built-in enum name or a
    /// custom <see cref="TillGroupDefinition"/> code). Null = catalogue default (the field's built-in
    /// group). Lets a shop move a field into one of its own custom groups.</summary>
    public string? GroupCode { get; set; }
    /// <summary>Override the VAT treatment. Null = catalogue default.</summary>
    public TillVatTreatment? Vat { get; set; }
    /// <summary>Override the accounting ledger category. Null = catalogue default.</summary>
    public LedgerCategory? LedgerCategory { get; set; }

    public Shop Shop { get; set; } = null!;
}
