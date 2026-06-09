namespace ScratchCard.Application.DTOs.StoreSales;

public class TillDto
{
    public Guid Id { get; set; }
    public Guid ShopId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Code { get; set; }
    public bool IsActive { get; set; }
    public decimal DefaultFloat { get; set; }
}

public class CreateTillRequest
{
    public Guid ShopId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Code { get; set; }
    public decimal DefaultFloat { get; set; }
}

public class UpdateTillRequest
{
    public string Name { get; set; } = string.Empty;
    public string? Code { get; set; }
    public bool IsActive { get; set; } = true;
    public decimal DefaultFloat { get; set; }
}
