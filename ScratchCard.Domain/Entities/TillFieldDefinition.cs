using ScratchCard.Domain.Common;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Domain.Entities;

/// <summary>
/// The canonical till-field catalogue, stored as data so the taxonomy can be edited without a code
/// deploy. Seeded from the built-in catalogue on first run; the resolver/accounting load these rows
/// into an in-memory cache. <see cref="Code"/> is the stable identity (built-in codes match the
/// <see cref="TillCanonicalField"/> enum names); per-shop <see cref="TillFieldOverride"/>s layer on top.
/// </summary>
public class TillFieldDefinition : AuditableEntity
{
    /// <summary>Null = global/built-in field (all shops). Set = a custom field owned by that shop.</summary>
    public Guid? ShopId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public TillFieldGroup Group { get; set; }
    /// <summary>Reconciliation group as a string code (built-in name or a custom group). Null falls back
    /// to <see cref="Group"/>.ToString(), so existing rows need no backfill.</summary>
    public string? GroupCode { get; set; }
    public TillCashDirection CashDirection { get; set; }
    public bool AffectsDrawer { get; set; }
    public TillVatTreatment Vat { get; set; }
    public bool IsCommissionIncome { get; set; }
    public LedgerCategory DefaultLedger { get; set; }
    public int SortOrder { get; set; }
    public bool IsBuiltIn { get; set; }
    public bool IsActive { get; set; } = true;
}
