using ScratchCard.Domain.Common;

namespace ScratchCard.Domain.Entities;

public class Shop : AuditableEntity
{
    public Guid? CompanyId { get; set; }
    public string ShopName { get; set; } = string.Empty;
    public string AddressLine1 { get; set; } = string.Empty;
    public string? AddressLine2 { get; set; }
    public string City { get; set; } = string.Empty;
    public string PostCode { get; set; } = string.Empty;
    public string Country { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
    public bool IsDeleted { get; set; }

    public Company? Company { get; set; }
    public ICollection<ShopUser> ShopUsers { get; set; } = new List<ShopUser>();
    public ICollection<UserInvitation> Invitations { get; set; } = new List<UserInvitation>();
    public ICollection<CfgGeneralSettings> GeneralSettings { get; set; } = new List<CfgGeneralSettings>();
    public ICollection<CfgPackSettings> PackSettings { get; set; } = new List<CfgPackSettings>();
    public ICollection<CfgSalesSettings> SalesSettings { get; set; } = new List<CfgSalesSettings>();
    public ICollection<CfgShiftSettings> ShiftSettings { get; set; } = new List<CfgShiftSettings>();
    public ICollection<CfgDayCloseSettings> DayCloseSettings { get; set; } = new List<CfgDayCloseSettings>();
    public ICollection<CfgPrizePayoutSettings> PrizePayoutSettings { get; set; } = new List<CfgPrizePayoutSettings>();
    public ICollection<CfgNotificationSettings> NotificationSettings { get; set; } = new List<CfgNotificationSettings>();
    public ICollection<CfgBarcodeSettings> BarcodeSettings { get; set; } = new List<CfgBarcodeSettings>();
    public ICollection<CfgOfflineSettings> OfflineSettings { get; set; } = new List<CfgOfflineSettings>();
    public ICollection<CfgSubscriptionSettings> SubscriptionSettings { get; set; } = new List<CfgSubscriptionSettings>();
    public ICollection<ShopScratchCardGame> ShopScratchCardGames { get; set; } = new List<ShopScratchCardGame>();
    public ICollection<Delivery> Deliveries { get; set; } = new List<Delivery>();
    public ICollection<ScratchCardPack> ScratchCardPacks { get; set; } = new List<ScratchCardPack>();
    public ICollection<BusinessDay> BusinessDays { get; set; } = new List<BusinessDay>();
    public ICollection<TemperatureMonitoringUnit> TemperatureMonitoringUnits { get; set; } = new List<TemperatureMonitoringUnit>();
    public ICollection<TemperatureReading> TemperatureReadings { get; set; } = new List<TemperatureReading>();
    public ICollection<TemperatureDailySignoff> TemperatureDailySignoffs { get; set; } = new List<TemperatureDailySignoff>();
    public ICollection<RefusalRegisterEntry> RefusalRegisterEntries { get; set; } = new List<RefusalRegisterEntry>();
    public ICollection<RefusalRegisterDailySignoff> RefusalRegisterDailySignoffs { get; set; } = new List<RefusalRegisterDailySignoff>();
}
