using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.DTOs.StoreSales;

public class TillFieldOverrideDto
{
    public Guid Id { get; set; }
    public Guid ShopId { get; set; }
    public TillCanonicalField CanonicalField { get; set; }
    public string FieldName { get; set; } = string.Empty;

    public TillFieldGroup? Group { get; set; }
    public TillVatTreatment? Vat { get; set; }
    public LedgerCategory? LedgerCategory { get; set; }

    // Built-in defaults, so the UI can show "what it would be" when no override is set.
    public TillFieldGroup DefaultGroup { get; set; }
    public TillVatTreatment DefaultVat { get; set; }
    public LedgerCategory DefaultLedgerCategory { get; set; }
}

public class UpsertTillFieldOverrideRequest
{
    public Guid ShopId { get; set; }
    public TillCanonicalField CanonicalField { get; set; }
    public TillFieldGroup? Group { get; set; }
    public TillVatTreatment? Vat { get; set; }
    public LedgerCategory? LedgerCategory { get; set; }
}

/// <summary>Copy a source shop's till-reconciliation config to other shops in the same company.</summary>
public class CopyTillConfigRequest
{
    public Guid SourceShopId { get; set; }
    public List<Guid> TargetShopIds { get; set; } = new();
    public bool IncludeFieldOverrides { get; set; } = true;
    public bool IncludeCounterConfig { get; set; } = true;
}
