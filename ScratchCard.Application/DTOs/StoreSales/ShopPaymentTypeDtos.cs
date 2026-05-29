namespace ScratchCard.Application.DTOs.StoreSales;

public class ShopPaymentTypeDto
{
    public Guid Id { get; set; }
    public Guid ShopId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Code { get; set; }
    public string? Keywords { get; set; }
    public int SortOrder { get; set; }
    public bool IsActive { get; set; }
}

public class CreateShopPaymentTypeRequest
{
    public Guid ShopId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Code { get; set; }
    public string? Keywords { get; set; }
    public int SortOrder { get; set; }
}

public class UpdateShopPaymentTypeRequest
{
    public string Name { get; set; } = string.Empty;
    public string? Code { get; set; }
    public string? Keywords { get; set; }
    public int SortOrder { get; set; }
    public bool IsActive { get; set; } = true;
}
