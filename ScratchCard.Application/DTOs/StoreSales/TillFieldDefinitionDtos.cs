using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.DTOs.StoreSales;

public class TillFieldDefinitionDto
{
    public Guid Id { get; set; }
    public string Code { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public TillFieldGroup Group { get; set; }
    public TillCashDirection CashDirection { get; set; }
    public bool AffectsDrawer { get; set; }
    public TillVatTreatment Vat { get; set; }
    public bool IsCommissionIncome { get; set; }
    public LedgerCategory DefaultLedger { get; set; }
    public int SortOrder { get; set; }
    public bool IsBuiltIn { get; set; }
    public bool IsActive { get; set; }
}

public class CreateTillFieldDefinitionRequest
{
    public string Code { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public TillFieldGroup Group { get; set; }
    public TillCashDirection CashDirection { get; set; }
    public bool AffectsDrawer { get; set; }
    public TillVatTreatment Vat { get; set; }
    public bool IsCommissionIncome { get; set; }
    public LedgerCategory DefaultLedger { get; set; }
}

public class TillFieldAliasDto
{
    public Guid Id { get; set; }
    public string NormalizedAlias { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
}

public class AddTillFieldAliasRequest
{
    public string Code { get; set; } = string.Empty;
    public string Alias { get; set; } = string.Empty;
}

public class UpdateTillFieldDefinitionRequest
{
    public string Code { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public TillFieldGroup Group { get; set; }
    public TillCashDirection CashDirection { get; set; }
    public bool AffectsDrawer { get; set; }
    public TillVatTreatment Vat { get; set; }
    public bool IsCommissionIncome { get; set; }
    public LedgerCategory DefaultLedger { get; set; }
    public bool IsActive { get; set; } = true;
}
