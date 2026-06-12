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

    // Marks the shop as a fuel forecourt. Drives the forecourt-only Visitors Log fields
    // (SPA passport / permit-to-work / induction) — those are hidden for non-fuel shops.
    public bool IsFuelStation { get; set; }

    // First day of the shop's working week: 0 = Sunday … 6 = Saturday (matches JS Date.getDay()).
    // Drives every calendar-week boundary (rota week, weekly timesheet email, weekly compliance
    // period). Defaults to Monday.
    public int WeekStartDay { get; set; } = 1;

    // Per-shop opt-out toggles for the top-level feature modules (ScratchCardManagement,
    // TemperatureLog, RefusalNoIdNoSale, ComplianceChecklist, SafeDropManagement). Entries here
    // override the subscription plan: even if the plan includes a module, a key listed here
    // makes it (and all its sub-features) unavailable for this shop. Each module toggle is
    // independent — disabling one does not affect the others.
    public List<string> DisabledFeatureKeys { get; set; } = new();

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
    public ICollection<Canister> Canisters { get; set; } = new List<Canister>();
    public ICollection<CanisterDrop> CanisterDrops { get; set; } = new List<CanisterDrop>();
    public ICollection<TemperatureMonitoringUnit> TemperatureMonitoringUnits { get; set; } = new List<TemperatureMonitoringUnit>();
    public ICollection<TemperatureReading> TemperatureReadings { get; set; } = new List<TemperatureReading>();
    public ICollection<TemperatureDailySignoff> TemperatureDailySignoffs { get; set; } = new List<TemperatureDailySignoff>();
    public ICollection<ShopChecklistGroup> ChecklistGroups { get; set; } = new List<ShopChecklistGroup>();
    public ICollection<ShopChecklistTask> ChecklistTasks { get; set; } = new List<ShopChecklistTask>();
    public ICollection<ShopChecklistTaskCompletion> ChecklistTaskCompletions { get; set; } = new List<ShopChecklistTaskCompletion>();
    public ICollection<ComplianceCheckGroup> ComplianceCheckGroups { get; set; } = new List<ComplianceCheckGroup>();
    public ICollection<ComplianceCheckItem> ComplianceCheckItems { get; set; } = new List<ComplianceCheckItem>();
    public ICollection<ComplianceCheckEntry> ComplianceCheckEntries { get; set; } = new List<ComplianceCheckEntry>();
    public ICollection<ComplianceCheckAttachment> ComplianceCheckAttachments { get; set; } = new List<ComplianceCheckAttachment>();
    public ICollection<RefusalRegisterEntry> RefusalRegisterEntries { get; set; } = new List<RefusalRegisterEntry>();
    public ICollection<RefusalRegisterDailySignoff> RefusalRegisterDailySignoffs { get; set; } = new List<RefusalRegisterDailySignoff>();
    public ICollection<VisitorLogEntry> VisitorLogEntries { get; set; } = new List<VisitorLogEntry>();
}
