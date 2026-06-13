namespace ScratchCard.Application.DTOs.StoreSales;

/// <summary>A shop's own custom till field (line item). Cash behaviour is reduced to a simple
/// in/out/none effect so a shopkeeper can't mis-set raw drawer flags.</summary>
public class TillShopFieldDto
{
    public Guid Id { get; set; }
    public Guid? ShopId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string GroupCode { get; set; } = string.Empty;
    /// <summary>"In" (money into drawer), "Out" (money out), or "None" (doesn't affect cash).</summary>
    public string CashEffect { get; set; } = "None";
    public bool IsActive { get; set; }
}

public class CreateTillShopFieldRequest
{
    public Guid ShopId { get; set; }
    public string DisplayName { get; set; } = string.Empty;
    public string GroupCode { get; set; } = string.Empty;
    public string CashEffect { get; set; } = "None"; // In | Out | None
}

public class UpdateTillShopFieldRequest
{
    public Guid Id { get; set; }
    public string DisplayName { get; set; } = string.Empty;
    public string GroupCode { get; set; } = string.Empty;
    public string CashEffect { get; set; } = "None";
    public bool IsActive { get; set; } = true;
}
