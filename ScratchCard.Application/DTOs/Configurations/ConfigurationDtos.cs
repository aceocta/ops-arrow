namespace ScratchCard.Application.DTOs.Configurations;

public class ConfigurationItemDto
{
    public Guid Id { get; set; }
    public Guid? ShopId { get; set; }
    public string ConfigKey { get; set; } = string.Empty;
    public string ConfigValue { get; set; } = string.Empty;
    public string DataType { get; set; } = string.Empty;
    public string GroupName { get; set; } = string.Empty;
    public string? Description { get; set; }
    public bool IsActive { get; set; }
}

public class UpdateConfigurationRequest
{
    public Guid? ShopId { get; set; }
    public IReadOnlyCollection<ConfigurationUpdateItem> Items { get; set; } = [];
}

public class ConfigurationUpdateItem
{
    public string? GroupName { get; set; }
    public string ConfigKey { get; set; } = string.Empty;
    public string ConfigValue { get; set; } = string.Empty;
}
