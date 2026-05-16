using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.Common.Models;

public class ShopShiftTemplate
{
    public string TemplateId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public TimeSpan StartTime { get; set; }
    public TimeSpan EndTime { get; set; }
    public bool IsActive { get; set; } = true;
}

public class ShopShiftSetup
{
    public string TimeZoneId { get; set; } = "UTC";
    public TimeSpan ShiftStartTime { get; set; } = new(6, 0, 0);
    public TimeSpan ShiftEndTime { get; set; } = new(23, 0, 0);
    public string DefaultShiftName { get; set; } = "Main Shift";
    public bool EnforceShiftTimeWindow { get; set; }
    public bool AllowCustomShiftName { get; set; } = true;
    public IReadOnlyCollection<ShopShiftTemplate> ShiftTemplates { get; set; } = Array.Empty<ShopShiftTemplate>();
}

public class ShopBusinessDaySetup
{
    public string TimeZoneId { get; set; } = "UTC";
    public TimeSpan BusinessStartTime { get; set; } = new(6, 0, 0);
    public TimeSpan BusinessEndTime { get; set; } = new(21, 59, 0);
}

public class ShopPackSetup
{
    public SellingOrder SellingOrder { get; set; } = SellingOrder.Ascending;
    public int DisplayCount { get; set; } = 24;
}
