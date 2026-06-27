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

    /// <summary>First day of the shop's week: 0 = Sunday … 6 = Saturday (JS getDay() convention).
    /// Optional — defaults to 1 (Monday) when omitted on create; left unchanged when omitted on update.</summary>
    public int? WeekStartDay { get; set; }

    /// <summary>Shift templates to seed for the new shop (set during shop setup).</summary>
    public List<CreateShopShiftTemplate>? ShiftTemplates { get; set; }
    /// <summary>Temperature check times to seed for the new shop (set during shop setup).</summary>
    public List<CreateShopTemperatureTime>? TemperatureCheckTimes { get; set; }

    /// <summary>Modules to start DISABLED for the new shop — the inverse of the owner's feature
    /// selection at creation time. Sanitised server-side to the known toggleable module keys.
    /// When null/omitted (e.g. an older client), the shop falls back to the platform
    /// default-disabled set.</summary>
    public List<string>? DisabledFeatureKeys { get; set; }
}

public class CreateShopShiftTemplate
{
    public string Name { get; set; } = string.Empty;
    public string StartTime { get; set; } = string.Empty; // "HH:mm"
    public string EndTime { get; set; } = string.Empty;   // "HH:mm"
}

public class CreateShopTemperatureTime
{
    public string Label { get; set; } = string.Empty;
    public string Time { get; set; } = string.Empty;       // "HH:mm"
    public int? ToleranceMinutes { get; set; }             // grace window; defaults to 30
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
    /// <summary>First day of the shop's week: 0 = Sunday … 6 = Saturday (JS getDay() convention).</summary>
    public int WeekStartDay { get; set; } = 1;
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
