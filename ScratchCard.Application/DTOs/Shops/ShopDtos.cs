using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.DTOs.Shops;

public class CreateShopRequest
{
    public Guid? CompanyId { get; set; }
    public string? CompanyName { get; set; }
    public Guid? SubscriptionPlanId { get; set; }
    public string ShopName { get; set; } = string.Empty;
    public string AddressLine1 { get; set; } = string.Empty;
    public string? AddressLine2 { get; set; }
    public string City { get; set; } = string.Empty;
    public string PostCode { get; set; } = string.Empty;
    public string Country { get; set; } = string.Empty;
    public int? ScratchCardDisplayCount { get; set; }
    public SellingOrder? PackSellingOrder { get; set; }
}

public class UpdateShopRequest : CreateShopRequest
{
    public bool IsActive { get; set; } = true;
}

public class ShopDto
{
    public Guid Id { get; set; }
    public Guid? CompanyId { get; set; }
    public string? CompanyName { get; set; }
    public string ShopName { get; set; } = string.Empty;
    public string AddressLine1 { get; set; } = string.Empty;
    public string? AddressLine2 { get; set; }
    public string City { get; set; } = string.Empty;
    public string PostCode { get; set; } = string.Empty;
    public string Country { get; set; } = string.Empty;
    public bool IsActive { get; set; }
}

public class ShopFeatureModuleDto
{
    public string Key { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public bool IsAvailableInPlan { get; set; }
    public bool IsDisabledByShop { get; set; }
}

public class ShopFeatureTogglesDto
{
    public Guid ShopId { get; set; }
    public IReadOnlyCollection<ShopFeatureModuleDto> Modules { get; set; } = [];
}

public class UpdateShopFeatureTogglesRequest
{
    public IReadOnlyCollection<string> DisabledFeatureKeys { get; set; } = [];
}
