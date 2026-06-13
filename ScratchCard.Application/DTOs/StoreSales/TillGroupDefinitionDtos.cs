namespace ScratchCard.Application.DTOs.StoreSales;

public class TillGroupDto
{
    public Guid Id { get; set; }
    /// <summary>Null = built-in (global, read-only); set = this shop's custom group.</summary>
    public Guid? ShopId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public int SortOrder { get; set; }
    public bool IsActive { get; set; }
    public bool IsBuiltIn { get; set; }
}

public class CreateTillGroupRequest
{
    public Guid ShopId { get; set; }
    public string DisplayName { get; set; } = string.Empty;
    public int? SortOrder { get; set; }
}

public class UpdateTillGroupRequest
{
    public Guid Id { get; set; }
    public string DisplayName { get; set; } = string.Empty;
    public int SortOrder { get; set; }
    public bool IsActive { get; set; } = true;
}
