using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using ScratchCard.Domain.Entities;
using ScratchCard.Domain.Enums;
using System.Text.Json;

namespace ScratchCard.Infrastructure.Persistence;

public class ApplicationDbContext : DbContext
{
    public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options) : base(options)
    {
    }

    public DbSet<User> Users => Set<User>();
    public DbSet<Role> Roles => Set<Role>();
    public DbSet<UserRole> UserRoles => Set<UserRole>();
    public DbSet<Company> Companies => Set<Company>();
    public DbSet<Shop> Shops => Set<Shop>();
    public DbSet<ShopUser> ShopUsers => Set<ShopUser>();
    public DbSet<UserInvitation> UserInvitations => Set<UserInvitation>();
    public DbSet<CfgGeneralSettings> CfgGeneralSettings => Set<CfgGeneralSettings>();
    public DbSet<CfgPackSettings> CfgPackSettings => Set<CfgPackSettings>();
    public DbSet<CfgSalesSettings> CfgSalesSettings => Set<CfgSalesSettings>();
    public DbSet<CfgShiftSettings> CfgShiftSettings => Set<CfgShiftSettings>();
    public DbSet<CfgDayCloseSettings> CfgDayCloseSettings => Set<CfgDayCloseSettings>();
    public DbSet<CfgPrizePayoutSettings> CfgPrizePayoutSettings => Set<CfgPrizePayoutSettings>();
    public DbSet<CfgNotificationSettings> CfgNotificationSettings => Set<CfgNotificationSettings>();
    public DbSet<CfgBarcodeSettings> CfgBarcodeSettings => Set<CfgBarcodeSettings>();
    public DbSet<CfgOfflineSettings> CfgOfflineSettings => Set<CfgOfflineSettings>();
    public DbSet<CfgSubscriptionSettings> CfgSubscriptionSettings => Set<CfgSubscriptionSettings>();
    public DbSet<ScratchCardGame> ScratchCardGames => Set<ScratchCardGame>();
    public DbSet<ShopScratchCardGame> ShopScratchCardGames => Set<ShopScratchCardGame>();
    public DbSet<Delivery> Deliveries => Set<Delivery>();
    public DbSet<DeliveryPack> DeliveryPacks => Set<DeliveryPack>();
    public DbSet<ScratchCardPack> ScratchCardPacks => Set<ScratchCardPack>();
    public DbSet<BusinessDay> BusinessDays => Set<BusinessDay>();
    public DbSet<Canister> Canisters => Set<Canister>();
    public DbSet<Shift> Shifts => Set<Shift>();
    public DbSet<ShiftOpeningSerial> ShiftOpeningSerials => Set<ShiftOpeningSerial>();
    public DbSet<ShiftScratchCardSale> ShiftScratchCardSales => Set<ShiftScratchCardSale>();
    public DbSet<ShiftPackClosing> ShiftPackClosings => Set<ShiftPackClosing>();
    public DbSet<CanisterDrop> CanisterDrops => Set<CanisterDrop>();
    public DbSet<PrizePayout> PrizePayouts => Set<PrizePayout>();
    public DbSet<ScratchCardDayCloseSummary> ScratchCardDayCloseSummaries => Set<ScratchCardDayCloseSummary>();
    public DbSet<ScratchCardDayReview> ScratchCardDayReviews => Set<ScratchCardDayReview>();
    public DbSet<ShiftReconciliation> ShiftReconciliations => Set<ShiftReconciliation>();
    public DbSet<ShiftCloseAttachment> ShiftCloseAttachments => Set<ShiftCloseAttachment>();
    public DbSet<BusinessDayCloseAttachment> BusinessDayCloseAttachments => Set<BusinessDayCloseAttachment>();
    public DbSet<NotificationLog> NotificationLogs => Set<NotificationLog>();
    public DbSet<UserPushToken> UserPushTokens => Set<UserPushToken>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<TemperatureMonitoringUnit> TemperatureMonitoringUnits => Set<TemperatureMonitoringUnit>();
    public DbSet<TemperatureReading> TemperatureReadings => Set<TemperatureReading>();
    public DbSet<TemperatureDailySignoff> TemperatureDailySignoffs => Set<TemperatureDailySignoff>();
    public DbSet<SignupEmailVerification> SignupEmailVerifications => Set<SignupEmailVerification>();
    public DbSet<ShopChecklistGroup> ShopChecklistGroups => Set<ShopChecklistGroup>();
    public DbSet<ShopChecklistTask> ShopChecklistTasks => Set<ShopChecklistTask>();
    public DbSet<ShopChecklistTaskCompletion> ShopChecklistTaskCompletions => Set<ShopChecklistTaskCompletion>();
    public DbSet<ComplianceCheckGroup> ComplianceCheckGroups => Set<ComplianceCheckGroup>();
    public DbSet<ComplianceCheckItem> ComplianceCheckItems => Set<ComplianceCheckItem>();
    public DbSet<ComplianceCheckEntry> ComplianceCheckEntries => Set<ComplianceCheckEntry>();
    public DbSet<DailyComplianceCheckEntry> DailyComplianceCheckEntries => Set<DailyComplianceCheckEntry>();
    public DbSet<WeeklyComplianceCheckEntry> WeeklyComplianceCheckEntries => Set<WeeklyComplianceCheckEntry>();
    public DbSet<MonthlyComplianceCheckEntry> MonthlyComplianceCheckEntries => Set<MonthlyComplianceCheckEntry>();
    public DbSet<ComplianceCheckAttachment> ComplianceCheckAttachments => Set<ComplianceCheckAttachment>();
    public DbSet<RefusalRegisterEntry> RefusalRegisterEntries => Set<RefusalRegisterEntry>();
    public DbSet<RefusalRegisterDailySignoff> RefusalRegisterDailySignoffs => Set<RefusalRegisterDailySignoff>();
    public DbSet<SubscriptionPlan> SubscriptionPlans => Set<SubscriptionPlan>();
    public DbSet<CompanySubscription> CompanySubscriptions => Set<CompanySubscription>();
    public DbSet<ShopSubscription> ShopSubscriptions => Set<ShopSubscription>();
    public DbSet<SubscriptionDiscountRule> SubscriptionDiscountRules => Set<SubscriptionDiscountRule>();
    public DbSet<SubscriptionInvoice> SubscriptionInvoices => Set<SubscriptionInvoice>();
    public DbSet<SubscriptionInvoiceLine> SubscriptionInvoiceLines => Set<SubscriptionInvoiceLine>();
    public DbSet<PaymentTransaction> PaymentTransactions => Set<PaymentTransaction>();
    public DbSet<BillingEvent> BillingEvents => Set<BillingEvent>();
    public DbSet<ReportExportLog> ReportExportLogs => Set<ReportExportLog>();
    public DbSet<Feature> Features => Set<Feature>();
    public DbSet<SubscriptionPlanFeature> SubscriptionPlanFeatures => Set<SubscriptionPlanFeature>();
    public DbSet<CfgTemperatureSchedule> CfgTemperatureSchedules => Set<CfgTemperatureSchedule>();
    public DbSet<Till> Tills => Set<Till>();
    public DbSet<ShopPaymentType> ShopPaymentTypes => Set<ShopPaymentType>();
    public DbSet<TillReport> TillReports => Set<TillReport>();
    public DbSet<TillReportLine> TillReportLines => Set<TillReportLine>();
    public DbSet<TillReportAttachment> TillReportAttachments => Set<TillReportAttachment>();
    public DbSet<TillReportPayment> TillReportPayments => Set<TillReportPayment>();
    public DbSet<TillCategoryRule> TillCategoryRules => Set<TillCategoryRule>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<User>(entity =>
        {
            entity.HasIndex(x => x.Email).IsUnique();
            entity.HasIndex(x => x.PasswordResetTokenHash);
            entity.Property(x => x.Email).HasMaxLength(320).IsRequired();
            entity.Property(x => x.FirstName).HasMaxLength(100).IsRequired();
            entity.Property(x => x.LastName).HasMaxLength(100).IsRequired();
            entity.Property(x => x.ExternalProvider).HasMaxLength(100);
            entity.Property(x => x.ExternalProviderUserId).HasMaxLength(200);
            entity.Property(x => x.PasswordResetTokenHash).HasMaxLength(200);
        });

        modelBuilder.Entity<SignupEmailVerification>(entity =>
        {
            entity.HasIndex(x => x.Email).IsUnique();
            entity.Property(x => x.Email).HasMaxLength(320).IsRequired();
            entity.Property(x => x.CodeHash).HasMaxLength(200).IsRequired();
        });

        modelBuilder.Entity<Role>(entity =>
        {
            entity.HasIndex(x => x.Name).IsUnique();
            entity.Property(x => x.Name).HasMaxLength(50).IsRequired();
            entity.Property(x => x.Description).HasMaxLength(300);
        });

        modelBuilder.Entity<UserRole>(entity =>
        {
            entity.ToTable("UserRoles");
            entity.HasIndex(x => new { x.UserId, x.RoleId }).IsUnique();
            entity.HasIndex(x => new { x.UserId, x.IsActive });
            entity.HasOne(x => x.User).WithMany(x => x.UserRoles).HasForeignKey(x => x.UserId);
            entity.HasOne(x => x.Role).WithMany(x => x.UserRoles).HasForeignKey(x => x.RoleId);
        });

        modelBuilder.Entity<Company>(entity =>
        {
            entity.HasIndex(x => x.CompanyName).IsUnique();
            entity.HasIndex(x => x.StripeCustomerId);
            entity.Property(x => x.CompanyName).HasMaxLength(200).IsRequired();
            entity.Property(x => x.RegistrationNumber).HasMaxLength(100);
            entity.Property(x => x.StripeCustomerId).HasMaxLength(200);
            entity.Property(x => x.Email).HasMaxLength(320).IsRequired();
            entity.Property(x => x.PhoneNumber).HasMaxLength(40);
            entity.Property(x => x.AddressLine1).HasMaxLength(200);
            entity.Property(x => x.AddressLine2).HasMaxLength(200);
            entity.Property(x => x.City).HasMaxLength(100);
            entity.Property(x => x.PostCode).HasMaxLength(20);
            entity.Property(x => x.Country).HasMaxLength(100).IsRequired().HasDefaultValue("UK");
            entity.Property(x => x.Status).HasDefaultValue(CompanyStatus.Active);
            entity.Property(x => x.IsDeleted).HasDefaultValue(false);
            entity.HasOne(x => x.OwnerUser).WithMany().HasForeignKey(x => x.OwnerUserId);
        });

        modelBuilder.Entity<Shop>(entity =>
        {
            // Shop name uniqueness is scoped to a company — two different companies can have a
            // shop with the same name, but within one company names must be unique. Filtered so
            // soft-deleted rows don't block reuse, and unassigned (CompanyId IS NULL) shops
            // never trigger the constraint.
            entity.HasIndex(x => new { x.CompanyId, x.ShopName })
                .IsUnique()
                .HasFilter("[IsDeleted] = 0 AND [CompanyId] IS NOT NULL");
            entity.Property(x => x.ShopName).HasMaxLength(200).IsRequired();
            entity.Property(x => x.AddressLine1).HasMaxLength(200).IsRequired();
            entity.Property(x => x.AddressLine2).HasMaxLength(200);
            entity.Property(x => x.City).HasMaxLength(100).IsRequired();
            entity.Property(x => x.PostCode).HasMaxLength(20).IsRequired();
            entity.Property(x => x.Country).HasMaxLength(100).IsRequired();
            entity.Property(x => x.IsDeleted).HasDefaultValue(false);
            entity.Property(x => x.DisabledFeatureKeys)
                .HasConversion(
                    v => JsonSerializer.Serialize(v ?? new List<string>(), (JsonSerializerOptions?)null),
                    v => string.IsNullOrEmpty(v)
                        ? new List<string>()
                        : JsonSerializer.Deserialize<List<string>>(v, (JsonSerializerOptions?)null) ?? new List<string>())
                .Metadata.SetValueComparer(new ValueComparer<List<string>>(
                    (a, b) => (a ?? new List<string>()).SequenceEqual(b ?? new List<string>()),
                    v => v == null ? 0 : v.Aggregate(0, (h, s) => HashCode.Combine(h, s.GetHashCode())),
                    v => v == null ? new List<string>() : v.ToList()));
            entity.HasOne(x => x.Company).WithMany(x => x.Shops).HasForeignKey(x => x.CompanyId);
        });

        modelBuilder.Entity<ShopUser>(entity =>
        {
            entity.HasIndex(x => new { x.ShopId, x.UserId }).IsUnique();
            entity.HasOne(x => x.Shop).WithMany(x => x.ShopUsers).HasForeignKey(x => x.ShopId);
            entity.HasOne(x => x.User).WithMany(x => x.ShopUsers).HasForeignKey(x => x.UserId);
            entity.HasOne(x => x.Role).WithMany(x => x.ShopUsers).HasForeignKey(x => x.RoleId);
        });

        modelBuilder.Entity<UserInvitation>(entity =>
        {
            entity.HasIndex(x => x.InvitationTokenHash).IsUnique();
            entity.Property(x => x.Email).HasMaxLength(320).IsRequired();
            entity.Property(x => x.InvitationTokenHash).HasMaxLength(200).IsRequired();
            entity.HasOne(x => x.Shop).WithMany(x => x.Invitations).HasForeignKey(x => x.ShopId);
            entity.HasOne(x => x.Role).WithMany(x => x.UserInvitations).HasForeignKey(x => x.RoleId);
        });

        ConfigureCfgSettings<CfgGeneralSettings>(modelBuilder, entity =>
        {
            entity.ToTable("CfgGeneralSettings");
            entity.Property(x => x.Currency).HasMaxLength(20);
            entity.Property(x => x.TimeZone).HasMaxLength(100);
            entity.Property(x => x.BusinessStartTime).HasMaxLength(20);
            entity.Property(x => x.BusinessEndTime).HasMaxLength(20);
            entity.Property(x => x.BusinessDateCutOffTime).HasMaxLength(20);
            entity.HasOne(x => x.Shop).WithMany(x => x.GeneralSettings).HasForeignKey(x => x.ShopId);
        });

        ConfigureCfgSettings<CfgPackSettings>(modelBuilder, entity =>
        {
            entity.ToTable("CfgPackSettings");
            entity.Property(x => x.DefaultSellingOrder).HasMaxLength(40);
            entity.Property(x => x.PackSellingOrder).HasMaxLength(40);
            entity.HasOne(x => x.Shop).WithMany(x => x.PackSettings).HasForeignKey(x => x.ShopId);
        });

        ConfigureCfgSettings<CfgSalesSettings>(modelBuilder, entity =>
        {
            entity.ToTable("CfgSalesSettings");
            entity.HasOne(x => x.Shop).WithMany(x => x.SalesSettings).HasForeignKey(x => x.ShopId);
        });

        ConfigureCfgSettings<CfgShiftSettings>(modelBuilder, entity =>
        {
            entity.ToTable("CfgShiftSettings");
            entity.Property(x => x.WhoCanReopenShift).HasMaxLength(200);
            entity.Property(x => x.ShiftStartTime).HasMaxLength(20);
            entity.Property(x => x.ShiftEndTime).HasMaxLength(20);
            entity.Property(x => x.ShiftDefaultName).HasMaxLength(100);
            entity.Property(x => x.ShiftTemplates).HasMaxLength(4000);
            entity.HasOne(x => x.Shop).WithMany(x => x.ShiftSettings).HasForeignKey(x => x.ShopId);
        });

        ConfigureCfgSettings<CfgDayCloseSettings>(modelBuilder, entity =>
        {
            entity.ToTable("CfgDayCloseSettings");
            entity.Property(x => x.WhoCanReopenDay).HasMaxLength(200);
            entity.HasOne(x => x.Shop).WithMany(x => x.DayCloseSettings).HasForeignKey(x => x.ShopId);
        });

        ConfigureCfgSettings<CfgPrizePayoutSettings>(modelBuilder, entity =>
        {
            entity.ToTable("CfgPrizePayoutSettings");
            entity.Property(x => x.CashierPayoutLimit).HasPrecision(18, 2);
            entity.Property(x => x.AllowedPayoutMethods).HasMaxLength(500);
            entity.HasOne(x => x.Shop).WithMany(x => x.PrizePayoutSettings).HasForeignKey(x => x.ShopId);
        });

        ConfigureCfgSettings<CfgNotificationSettings>(modelBuilder, entity =>
        {
            entity.ToTable("CfgNotificationSettings");
            entity.Property(x => x.NotificationChannels).HasMaxLength(400);
            entity.Property(x => x.ManualEntryNotificationRecipients).HasMaxLength(500);
            entity.Property(x => x.CashDifferenceNotificationRecipients).HasMaxLength(500);
            entity.Property(x => x.HighPrizePayoutNotificationRecipients).HasMaxLength(500);
            entity.HasOne(x => x.Shop).WithMany(x => x.NotificationSettings).HasForeignKey(x => x.ShopId);
        });

        ConfigureCfgSettings<CfgBarcodeSettings>(modelBuilder, entity =>
        {
            entity.ToTable("CfgBarcodeSettings");
            entity.Property(x => x.BarcodeContains).HasMaxLength(100);
            entity.Property(x => x.RemovePrefix).HasMaxLength(100);
            entity.Property(x => x.RemoveSuffix).HasMaxLength(100);
            entity.HasOne(x => x.Shop).WithMany(x => x.BarcodeSettings).HasForeignKey(x => x.ShopId);
        });

        ConfigureCfgSettings<CfgOfflineSettings>(modelBuilder, entity =>
        {
            entity.ToTable("CfgOfflineSettings");
            entity.HasOne(x => x.Shop).WithMany(x => x.OfflineSettings).HasForeignKey(x => x.ShopId);
        });

        ConfigureCfgSettings<CfgSubscriptionSettings>(modelBuilder, entity =>
        {
            entity.ToTable("CfgSubscriptionSettings");
            entity.HasOne(x => x.Shop).WithMany(x => x.SubscriptionSettings).HasForeignKey(x => x.ShopId);
        });

        modelBuilder.Entity<ScratchCardGame>(entity =>
        {
            entity.ToTable("MasterScratchCardGames");
            entity.HasIndex(x => x.GameCode).IsUnique();
            entity.Property(x => x.GameName).HasMaxLength(100).IsRequired();
            entity.Property(x => x.GameCode).HasMaxLength(30).IsRequired();
            entity.Property(x => x.TicketPrice).HasPrecision(18, 2);
            entity.Property(x => x.TicketsPerPack).IsRequired();
        });

        modelBuilder.Entity<ShopScratchCardGame>(entity =>
        {
            entity.ToTable("ShopScratchCardGames");
            entity.HasIndex(x => new { x.ShopId, x.MasterGameId, x.IsDeleted }).IsUnique();
            entity.Property(x => x.DefaultStartSerialNumber).HasMaxLength(30).IsRequired();
            entity.Property(x => x.DefaultEndSerialNumber).HasMaxLength(30).IsRequired();
            entity.HasOne(x => x.Shop).WithMany(x => x.ShopScratchCardGames).HasForeignKey(x => x.ShopId);
            entity.HasOne(x => x.MasterGame).WithMany(x => x.ShopScratchCardGames).HasForeignKey(x => x.MasterGameId);
        });

        modelBuilder.Entity<Delivery>(entity =>
        {
            entity.Property(x => x.SupplierName).HasMaxLength(200).IsRequired();
            entity.Property(x => x.DeliveryReference).HasMaxLength(100).IsRequired();
            entity.Property(x => x.Notes).HasMaxLength(1000);
        });

        modelBuilder.Entity<DeliveryPack>(entity =>
        {
            entity.HasIndex(x => new { x.DeliveryId, x.ScratchCardPackId }).IsUnique();
            entity.HasOne(x => x.Delivery).WithMany(x => x.DeliveryPacks).HasForeignKey(x => x.DeliveryId);
            entity.HasOne(x => x.ScratchCardPack).WithMany(x => x.DeliveryPacks).HasForeignKey(x => x.ScratchCardPackId);
        });

        modelBuilder.Entity<Till>(entity =>
        {
            entity.HasIndex(x => new { x.ShopId, x.IsActive });
            entity.HasIndex(x => new { x.ShopId, x.Name }).IsUnique();
            entity.Property(x => x.Name).HasMaxLength(100).IsRequired();
            entity.Property(x => x.Code).HasMaxLength(50);
            entity.Property(x => x.IsActive).HasDefaultValue(true);
            entity.Property(x => x.IsDeleted).HasDefaultValue(false);
            entity.HasOne(x => x.Shop).WithMany().HasForeignKey(x => x.ShopId);
        });

        modelBuilder.Entity<TillReport>(entity =>
        {
            entity.HasIndex(x => new { x.ShopId, x.BusinessDate });
            entity.HasIndex(x => x.ShiftId);
            entity.HasIndex(x => x.TillId);
            entity.Property(x => x.TotalIncome).HasPrecision(18, 2);
            entity.Property(x => x.TotalExpense).HasPrecision(18, 2);
            entity.Property(x => x.IsDeleted).HasDefaultValue(false);
            entity.HasOne(x => x.Shop).WithMany().HasForeignKey(x => x.ShopId);
            entity.HasOne(x => x.Till).WithMany().HasForeignKey(x => x.TillId).OnDelete(DeleteBehavior.NoAction);
            entity.HasOne(x => x.Shift).WithMany().HasForeignKey(x => x.ShiftId).OnDelete(DeleteBehavior.NoAction);
            entity.HasOne(x => x.BusinessDay).WithMany().HasForeignKey(x => x.BusinessDayId).OnDelete(DeleteBehavior.NoAction);
            entity.HasMany(x => x.Lines).WithOne(x => x.TillReport).HasForeignKey(x => x.TillReportId).OnDelete(DeleteBehavior.Cascade);
            entity.HasMany(x => x.Attachments).WithOne(x => x.TillReport).HasForeignKey(x => x.TillReportId).OnDelete(DeleteBehavior.Cascade);
            entity.HasMany(x => x.Payments).WithOne(x => x.TillReport).HasForeignKey(x => x.TillReportId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<TillReportLine>(entity =>
        {
            entity.HasIndex(x => x.TillReportId);
            entity.Property(x => x.RawDescription).HasMaxLength(500).IsRequired();
            entity.Property(x => x.TypeCode).HasMaxLength(50);
            entity.Property(x => x.Notes).HasMaxLength(500);
            entity.Property(x => x.Amount).HasPrecision(18, 2);
        });

        modelBuilder.Entity<TillReportAttachment>(entity =>
        {
            entity.HasIndex(x => x.TillReportId);
            entity.Property(x => x.StoredPath).HasMaxLength(500).IsRequired();
            entity.Property(x => x.OriginalFileName).HasMaxLength(260).IsRequired();
            entity.Property(x => x.ContentType).HasMaxLength(100).IsRequired();
        });

        modelBuilder.Entity<ShopPaymentType>(entity =>
        {
            entity.HasIndex(x => new { x.ShopId, x.IsActive });
            entity.HasIndex(x => new { x.ShopId, x.Name }).IsUnique();
            entity.Property(x => x.Name).HasMaxLength(100).IsRequired();
            entity.Property(x => x.Code).HasMaxLength(50);
            entity.Property(x => x.Keywords).HasMaxLength(500);
            entity.Property(x => x.IsActive).HasDefaultValue(true);
            entity.Property(x => x.IsDeleted).HasDefaultValue(false);
            entity.HasOne(x => x.Shop).WithMany().HasForeignKey(x => x.ShopId);
        });

        modelBuilder.Entity<TillReportPayment>(entity =>
        {
            entity.HasIndex(x => new { x.TillReportId, x.PaymentTypeId })
                .IsUnique()
                .HasFilter("[PaymentTypeId] IS NOT NULL");
            entity.Property(x => x.PaymentTypeName).HasMaxLength(100).IsRequired();
            entity.Property(x => x.Amount).HasPrecision(18, 2);
            entity.HasOne(x => x.PaymentType).WithMany().HasForeignKey(x => x.PaymentTypeId).OnDelete(DeleteBehavior.NoAction);
        });

        modelBuilder.Entity<TillCategoryRule>(entity =>
        {
            entity.HasIndex(x => new { x.ShopId, x.IsActive });
            entity.Property(x => x.Pattern).HasMaxLength(200).IsRequired();
            entity.Property(x => x.IsActive).HasDefaultValue(true);
            entity.Property(x => x.IsDeleted).HasDefaultValue(false);
            entity.HasOne(x => x.Shop).WithMany().HasForeignKey(x => x.ShopId);
        });

        modelBuilder.Entity<ScratchCardPack>(entity =>
        {
            entity.HasIndex(x => new { x.ShopId, x.PackNumber }).IsUnique();
            entity.Property(x => x.PackNumber).HasMaxLength(50).IsRequired();
            entity.Property(x => x.TicketPrice).HasPrecision(18, 2);
            entity.Property(x => x.StartSerialNumber).HasMaxLength(30).IsRequired();
            entity.Property(x => x.EndSerialNumber).HasMaxLength(30).IsRequired();
            entity.Property(x => x.CurrentSerialNumber).HasMaxLength(30).IsRequired();
            entity.Property(x => x.IsManuallyAdded).HasDefaultValue(false);
            entity.Property(x => x.Notes).HasMaxLength(1000);
            entity.HasOne(x => x.Shop).WithMany(x => x.ScratchCardPacks).HasForeignKey(x => x.ShopId);
            entity.HasOne(x => x.Game).WithMany(x => x.ScratchCardPacks).HasForeignKey(x => x.GameId);
        });

        modelBuilder.Entity<BusinessDay>(entity =>
        {
            entity.HasIndex(x => new { x.ShopId, x.BusinessDate }).IsUnique();
            entity.Property(x => x.TotalSalesAmount).HasPrecision(18, 2);
            entity.Property(x => x.TotalPrizePayout).HasPrecision(18, 2);
            entity.Property(x => x.ExpectedCash).HasPrecision(18, 2);
            entity.Property(x => x.Difference).HasPrecision(18, 2);
            entity.Property(x => x.Notes).HasMaxLength(1000);
            entity.HasOne(x => x.Shop).WithMany(x => x.BusinessDays).HasForeignKey(x => x.ShopId);
        });

        modelBuilder.Entity<ScratchCardDayReview>(entity =>
        {
            entity.HasIndex(x => x.BusinessDayId).IsUnique();
            entity.Property(x => x.TillPayout).HasPrecision(18, 2);
            entity.Property(x => x.ScratchCardSummaryPayout).HasPrecision(18, 2);
            entity.Property(x => x.Note).HasMaxLength(1000);
            entity.HasOne(x => x.BusinessDay).WithOne(x => x.ScratchCardDayReview).HasForeignKey<ScratchCardDayReview>(x => x.BusinessDayId);
            entity.HasOne(x => x.ReviewedByUser).WithMany().HasForeignKey(x => x.ReviewedByUserId);
        });

        modelBuilder.Entity<ScratchCardDayCloseSummary>(entity =>
        {
            entity.HasIndex(x => x.BusinessDayId).IsUnique();
            entity.Property(x => x.LottoPayout).HasPrecision(18, 2);
            entity.Property(x => x.ScratchCardPayout).HasPrecision(18, 2);
            entity.Property(x => x.TillPayout).HasPrecision(18, 2);
            entity.Property(x => x.TotalCanisterDropAmount).HasPrecision(18, 2);
            entity.Property(x => x.CashVariance).HasPrecision(18, 2);
            entity.HasOne(x => x.BusinessDay)
                .WithOne(x => x.ScratchCardDayCloseSummary)
                .HasForeignKey<ScratchCardDayCloseSummary>(x => x.BusinessDayId);
        });

        modelBuilder.Entity<Shift>(entity =>
        {
            entity.HasIndex(x => new { x.BusinessDayId, x.ShiftName });
            entity.Property(x => x.ShiftName).HasMaxLength(100).IsRequired();
            entity.Property(x => x.Notes).HasMaxLength(1000);
            entity.HasOne(x => x.BusinessDay).WithMany(x => x.Shifts).HasForeignKey(x => x.BusinessDayId);
            entity.HasOne(x => x.Shop).WithMany().HasForeignKey(x => x.ShopId);
        });

        modelBuilder.Entity<Canister>(entity =>
        {
            entity.HasIndex(x => new { x.ShopId, x.CanisterNumber }).IsUnique();
            entity.HasIndex(x => new { x.ShopId, x.IsActive });
            entity.Property(x => x.CanisterNumber).HasMaxLength(60).IsRequired();
            entity.Property(x => x.IsActive).HasDefaultValue(true);
            entity.Property(x => x.MaxAmount).HasPrecision(18, 2);
            entity.HasOne(x => x.Shop).WithMany(x => x.Canisters).HasForeignKey(x => x.ShopId);
        });

        modelBuilder.Entity<CanisterDrop>(entity =>
        {
            entity.HasIndex(x => new { x.BusinessDayId, x.ShiftId, x.DroppedOn });
            entity.HasIndex(x => new { x.ShopId, x.DroppedOn });
            entity.HasIndex(x => new { x.ShopId, x.ApprovalStatus });
            entity.Property(x => x.DroppedByName).HasMaxLength(200).IsRequired();
            entity.Property(x => x.Amount).HasPrecision(18, 2);
            entity.Property(x => x.ApprovalNotes).HasMaxLength(500);
            entity.HasOne(x => x.Shop).WithMany(x => x.CanisterDrops).HasForeignKey(x => x.ShopId);
            entity.HasOne(x => x.BusinessDay).WithMany(x => x.CanisterDrops).HasForeignKey(x => x.BusinessDayId);
            entity.HasOne(x => x.Shift).WithMany(x => x.CanisterDrops).HasForeignKey(x => x.ShiftId);
            entity.HasOne(x => x.Canister).WithMany(x => x.CanisterDrops).HasForeignKey(x => x.CanisterId);
        });

        modelBuilder.Entity<ShiftOpeningSerial>(entity =>
        {
            entity.HasIndex(x => new { x.ShiftId, x.PackId }).IsUnique();
            entity.HasIndex(x => new { x.BusinessDayId, x.ShopId });
            entity.Property(x => x.ExpectedOpeningSerialNumber).HasMaxLength(30).IsRequired();
            entity.Property(x => x.ActualOpeningSerialNumber).HasMaxLength(30).IsRequired();
            entity.HasOne(x => x.Shift).WithMany(x => x.OpeningSerials).HasForeignKey(x => x.ShiftId);
            entity.HasOne(x => x.BusinessDay).WithMany().HasForeignKey(x => x.BusinessDayId);
            entity.HasOne(x => x.Shop).WithMany().HasForeignKey(x => x.ShopId);
            entity.HasOne(x => x.Pack).WithMany(x => x.OpeningSerials).HasForeignKey(x => x.PackId);
        });

        modelBuilder.Entity<ShiftScratchCardSale>(entity =>
        {
            entity.Property(x => x.OpeningSerialNumber).HasMaxLength(30).IsRequired();
            entity.Property(x => x.ClosingSerialNumber).HasMaxLength(30).IsRequired();
            entity.Property(x => x.OriginalScannedSerialNumber).HasMaxLength(30);
            entity.Property(x => x.TicketPrice).HasPrecision(18, 2);
            entity.Property(x => x.SalesAmount).HasPrecision(18, 2);
            entity.Property(x => x.ManualEntryReason).HasMaxLength(500);
            entity.Property(x => x.Notes).HasMaxLength(1000);
            entity.HasOne(x => x.Shift).WithMany(x => x.ShiftSales).HasForeignKey(x => x.ShiftId);
            entity.HasOne(x => x.Pack).WithMany(x => x.ShiftSales).HasForeignKey(x => x.PackId);
            entity.HasOne(x => x.Shop).WithMany().HasForeignKey(x => x.ShopId);
        });

        modelBuilder.Entity<ShiftPackClosing>(entity =>
        {
            entity.HasIndex(x => new { x.ShiftId, x.PackId }).IsUnique();
            entity.Property(x => x.ClosingSerialNumber).HasMaxLength(30).IsRequired();
            entity.Property(x => x.OriginalScannedSerialNumber).HasMaxLength(30);
            entity.Property(x => x.ManualEntryReason).HasMaxLength(500);
            entity.Property(x => x.Notes).HasMaxLength(1000);
            entity.HasOne(x => x.Shift).WithMany().HasForeignKey(x => x.ShiftId);
            entity.HasOne(x => x.Pack).WithMany().HasForeignKey(x => x.PackId);
            entity.HasOne(x => x.Shop).WithMany().HasForeignKey(x => x.ShopId);
        });

        modelBuilder.Entity<PrizePayout>(entity =>
        {
            entity.HasIndex(x => new { x.ShiftId, x.PackId, x.TicketNumber });
            entity.Property(x => x.TicketNumber).HasMaxLength(30);
            entity.Property(x => x.PrizeAmount).HasPrecision(18, 2);
            entity.Property(x => x.PaymentMethod).HasMaxLength(50).IsRequired();
            entity.Property(x => x.Notes).HasMaxLength(1000);
            entity.HasOne(x => x.Shop).WithMany().HasForeignKey(x => x.ShopId);
            entity.HasOne(x => x.BusinessDay).WithMany(x => x.PrizePayouts).HasForeignKey(x => x.BusinessDayId);
            entity.HasOne(x => x.Shift).WithMany(x => x.PrizePayouts).HasForeignKey(x => x.ShiftId);
            entity.HasOne(x => x.Pack).WithMany().HasForeignKey(x => x.PackId);
        });

        modelBuilder.Entity<ShiftReconciliation>(entity =>
        {
            entity.HasIndex(x => x.ShiftId).IsUnique();
            entity.Property(x => x.TotalSalesAmount).HasPrecision(18, 2);
            entity.Property(x => x.TotalPrizePayout).HasPrecision(18, 2);
            entity.Property(x => x.ExpectedCash).HasPrecision(18, 2);
            entity.Property(x => x.Difference).HasPrecision(18, 2);
            entity.Property(x => x.Notes).HasMaxLength(1000);
            entity.HasOne(x => x.Shift).WithOne(x => x.ShiftReconciliation).HasForeignKey<ShiftReconciliation>(x => x.ShiftId);
            entity.HasOne(x => x.Shop).WithMany().HasForeignKey(x => x.ShopId);
        });

        modelBuilder.Entity<ShiftCloseAttachment>(entity =>
        {
            entity.HasIndex(x => x.ShiftReconciliationId);
            entity.Property(x => x.OriginalFileName).HasMaxLength(260).IsRequired();
            entity.Property(x => x.StoredFileName).HasMaxLength(320).IsRequired();
            entity.Property(x => x.StoredPath).HasMaxLength(1000).IsRequired();
            entity.Property(x => x.ContentType).HasMaxLength(120);
            entity.HasOne(x => x.ShiftReconciliation)
                .WithMany(x => x.Attachments)
                .HasForeignKey(x => x.ShiftReconciliationId);
            entity.HasOne(x => x.Shop)
                .WithMany()
                .HasForeignKey(x => x.ShopId);
        });

        modelBuilder.Entity<BusinessDayCloseAttachment>(entity =>
        {
            entity.HasIndex(x => x.BusinessDayId);
            entity.Property(x => x.OriginalFileName).HasMaxLength(260).IsRequired();
            entity.Property(x => x.StoredFileName).HasMaxLength(320).IsRequired();
            entity.Property(x => x.StoredPath).HasMaxLength(1000).IsRequired();
            entity.Property(x => x.ContentType).HasMaxLength(120);
            entity.HasOne(x => x.BusinessDay)
                .WithMany(x => x.CloseAttachments)
                .HasForeignKey(x => x.BusinessDayId);
            entity.HasOne(x => x.Shop)
                .WithMany()
                .HasForeignKey(x => x.ShopId);
        });

        modelBuilder.Entity<NotificationLog>(entity =>
        {
            entity.Property(x => x.Recipient).HasMaxLength(320).IsRequired();
            entity.Property(x => x.Subject).HasMaxLength(500).IsRequired();
            entity.Property(x => x.Message).HasMaxLength(4000).IsRequired();
            entity.Property(x => x.FailedReason).HasMaxLength(1000);
            entity.Property(x => x.RelatedEntityName).HasMaxLength(200).IsRequired();
            entity.HasOne(x => x.Shop).WithMany().HasForeignKey(x => x.ShopId);
        });

        modelBuilder.Entity<UserPushToken>(entity =>
        {
            entity.HasIndex(x => new { x.ShopId, x.UserId, x.PushToken }).IsUnique();
            entity.HasIndex(x => new { x.ShopId, x.IsActive });
            entity.HasIndex(x => new { x.UserId, x.IsActive });
            entity.Property(x => x.PushToken).HasMaxLength(256).IsRequired();
            entity.Property(x => x.Platform).HasMaxLength(32).IsRequired();
            entity.Property(x => x.DeviceName).HasMaxLength(120);
            entity.Property(x => x.IsActive).HasDefaultValue(true);
            entity.HasOne(x => x.Shop).WithMany().HasForeignKey(x => x.ShopId);
            entity.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId);
        });

        modelBuilder.Entity<AuditLog>(entity =>
        {
            entity.Property(x => x.EntityName).HasMaxLength(200).IsRequired();
            entity.Property(x => x.ActionType).HasMaxLength(100).IsRequired();
            entity.Property(x => x.Reason).HasMaxLength(500);
            entity.Property(x => x.IpAddress).HasMaxLength(100);
        });

        modelBuilder.Entity<TemperatureMonitoringUnit>(entity =>
        {
            entity.HasIndex(x => new { x.ShopId, x.UnitName, x.IsDeleted }).IsUnique();
            entity.Property(x => x.UnitName).HasMaxLength(120).IsRequired();
            entity.Property(x => x.MinTemperatureCelsius).HasPrecision(5, 2);
            entity.Property(x => x.MaxTemperatureCelsius).HasPrecision(5, 2);
            entity.Property(x => x.Location).HasMaxLength(200);
            entity.Property(x => x.Notes).HasMaxLength(1000);
            entity.HasOne(x => x.Shop).WithMany(x => x.TemperatureMonitoringUnits).HasForeignKey(x => x.ShopId);
        });

        modelBuilder.Entity<TemperatureReading>(entity =>
        {
            entity.HasIndex(x => new { x.ShopId, x.ReadingDate });
            entity.HasIndex(x => new { x.TemperatureMonitoringUnitId, x.ReadingDate, x.ReadingTime }).IsUnique();
            entity.Property(x => x.TemperatureCelsius).HasPrecision(5, 2);
            entity.Property(x => x.CheckedByInitials).HasMaxLength(20).IsRequired();
            entity.Property(x => x.Notes).HasMaxLength(500);
            entity.Property(x => x.ActionTaken).HasMaxLength(500);
            entity.Property(x => x.RecordedByName).HasMaxLength(200);
            entity.HasIndex(x => x.ScheduleId);
            entity.HasOne(x => x.Shop).WithMany(x => x.TemperatureReadings).HasForeignKey(x => x.ShopId);
            entity.HasOne(x => x.TemperatureMonitoringUnit).WithMany(x => x.Readings).HasForeignKey(x => x.TemperatureMonitoringUnitId);
            entity.HasOne(x => x.Schedule).WithMany().HasForeignKey(x => x.ScheduleId).OnDelete(DeleteBehavior.NoAction);
        });

        modelBuilder.Entity<TemperatureDailySignoff>(entity =>
        {
            entity.HasIndex(x => new { x.ShopId, x.SignoffDate }).IsUnique();
            entity.Property(x => x.SignedByInitials).HasMaxLength(20).IsRequired();
            entity.Property(x => x.SignedByName).HasMaxLength(200).IsRequired();
            entity.Property(x => x.Notes).HasMaxLength(1000);
            entity.HasOne(x => x.Shop).WithMany(x => x.TemperatureDailySignoffs).HasForeignKey(x => x.ShopId);
        });

        modelBuilder.Entity<ShopChecklistGroup>(entity =>
        {
            entity.HasIndex(x => new { x.ShopId, x.IsDeleted });
            entity.HasIndex(x => new { x.ShopId, x.DisplayOrder });
            entity.HasIndex(x => new { x.ShopId, x.GroupName, x.IsDeleted }).IsUnique();
            entity.Property(x => x.GroupName).HasMaxLength(120).IsRequired();
            entity.Property(x => x.Description).HasMaxLength(500);
            entity.Property(x => x.IsActive).HasDefaultValue(true);
            entity.Property(x => x.IsDeleted).HasDefaultValue(false);
            entity.Property(x => x.IsSystemDefault).HasDefaultValue(false);
            entity.HasOne(x => x.Shop).WithMany(x => x.ChecklistGroups).HasForeignKey(x => x.ShopId);
        });

        modelBuilder.Entity<ShopChecklistTask>(entity =>
        {
            entity.HasIndex(x => new { x.ShopId, x.IsDeleted });
            entity.HasIndex(x => new { x.ChecklistGroupId, x.DisplayOrder });
            entity.HasIndex(x => new { x.ChecklistGroupId, x.TaskName, x.IsDeleted }).IsUnique();
            entity.Property(x => x.TaskName).HasMaxLength(180).IsRequired();
            entity.Property(x => x.Description).HasMaxLength(800);
            entity.Property(x => x.IsActive).HasDefaultValue(true);
            entity.Property(x => x.IsRequired).HasDefaultValue(true);
            entity.Property(x => x.NotesRequiredOnComplete).HasDefaultValue(false);
            entity.Property(x => x.RequiredForShopOpen).HasDefaultValue(false);
            entity.Property(x => x.RequiredForShiftClose).HasDefaultValue(false);
            entity.Property(x => x.RequiredForDayClose).HasDefaultValue(false);
            entity.Property(x => x.IsDeleted).HasDefaultValue(false);
            entity.Property(x => x.IsSystemDefault).HasDefaultValue(false);
            entity.HasOne(x => x.Shop).WithMany(x => x.ChecklistTasks).HasForeignKey(x => x.ShopId);
            entity.HasOne(x => x.ChecklistGroup).WithMany(x => x.Tasks).HasForeignKey(x => x.ChecklistGroupId);
        });

        modelBuilder.Entity<ShopChecklistTaskCompletion>(entity =>
        {
            entity.HasIndex(x => new { x.ShopId, x.BusinessDate });
            entity.HasIndex(x => new { x.ShopId, x.BusinessDate, x.ChecklistTaskId })
                .IsUnique()
                .HasFilter("[ShiftId] IS NULL");
            entity.HasIndex(x => new { x.ShopId, x.BusinessDate, x.ShiftId, x.ChecklistTaskId })
                .IsUnique()
                .HasFilter("[ShiftId] IS NOT NULL");
            entity.HasIndex(x => new { x.ChecklistGroupId, x.ChecklistTaskId });
            entity.Property(x => x.CompletedByName).HasMaxLength(200);
            entity.Property(x => x.Notes).HasMaxLength(1000);
            entity.Property(x => x.IsCompleted).HasDefaultValue(false);
            entity.HasOne(x => x.Shop).WithMany(x => x.ChecklistTaskCompletions).HasForeignKey(x => x.ShopId);
            entity.HasOne(x => x.ChecklistGroup).WithMany().HasForeignKey(x => x.ChecklistGroupId);
            entity.HasOne(x => x.ChecklistTask).WithMany().HasForeignKey(x => x.ChecklistTaskId);
            entity.HasOne(x => x.Shift).WithMany(x => x.ChecklistTaskCompletions).HasForeignKey(x => x.ShiftId);
            entity.HasOne<Company>().WithMany().HasForeignKey(x => x.CompanyId);
        });

        modelBuilder.Entity<ComplianceCheckGroup>(entity =>
        {
            entity.HasIndex(x => new { x.ShopId, x.Frequency, x.DisplayOrder });
            entity.HasIndex(x => new { x.ShopId, x.Frequency, x.GroupName, x.IsDeleted }).IsUnique();
            entity.Property(x => x.GroupName).HasMaxLength(200).IsRequired();
            entity.Property(x => x.Description).HasMaxLength(1000);
            entity.Property(x => x.IsActive).HasDefaultValue(true);
            entity.Property(x => x.IsSystemDefault).HasDefaultValue(false);
            entity.Property(x => x.IsDeleted).HasDefaultValue(false);
            entity.HasOne(x => x.Shop).WithMany(x => x.ComplianceCheckGroups).HasForeignKey(x => x.ShopId);
        });

        modelBuilder.Entity<ComplianceCheckItem>(entity =>
        {
            entity.HasIndex(x => new { x.ShopId, x.ComplianceCheckGroupId, x.DisplayOrder });
            entity.HasIndex(x => new { x.ComplianceCheckGroupId, x.ItemName, x.IsDeleted }).IsUnique();
            entity.Property(x => x.ItemName).HasMaxLength(260).IsRequired();
            entity.Property(x => x.Description).HasMaxLength(1000);
            entity.Property(x => x.IsRequired).HasDefaultValue(true);
            entity.Property(x => x.IsActive).HasDefaultValue(true);
            entity.Property(x => x.IsSystemDefault).HasDefaultValue(false);
            entity.Property(x => x.IsDeleted).HasDefaultValue(false);
            entity.HasOne(x => x.Shop).WithMany(x => x.ComplianceCheckItems).HasForeignKey(x => x.ShopId);
            entity.HasOne(x => x.ComplianceCheckGroup).WithMany(x => x.Items).HasForeignKey(x => x.ComplianceCheckGroupId);
        });

        modelBuilder.Entity<ComplianceCheckEntry>(entity =>
        {
            entity.UseTpcMappingStrategy();
            entity.Ignore(x => x.PeriodStartDate);
            entity.Ignore(x => x.PeriodEndDate);
            entity.Ignore(x => x.PeriodDate);
            entity.Ignore(x => x.PeriodLabel);
            entity.Ignore(x => x.MonthName);
            entity.Ignore(x => x.MonthNumber);
            entity.Ignore(x => x.MonthYear);
        });

        ConfigureComplianceCheckEntryEntity<DailyComplianceCheckEntry>(
            modelBuilder,
            tableName: "DailyComplianceCheckEntries",
            frequency: ComplianceCheckFrequency.Daily,
            configurePeriodColumns: entity =>
            {
                entity.Property(x => x.CheckDate).HasColumnType("date");
                entity.HasIndex(x => new { x.ShopId, x.CheckDate });
                entity.HasIndex(x => new { x.ShopId, x.CheckDate, x.ComplianceCheckItemId }).IsUnique();
            });

        ConfigureComplianceCheckEntryEntity<WeeklyComplianceCheckEntry>(
            modelBuilder,
            tableName: "WeeklyComplianceCheckEntries",
            frequency: ComplianceCheckFrequency.Weekly,
            configurePeriodColumns: entity =>
            {
                entity.Property(x => x.WeekStartDate).HasColumnType("date");
                entity.Property(x => x.WeekEndDate).HasColumnType("date");
                entity.HasIndex(x => new { x.ShopId, x.WeekStartDate, x.WeekEndDate });
                entity.HasIndex(x => new { x.ShopId, x.WeekStartDate, x.WeekEndDate, x.ComplianceCheckItemId }).IsUnique();
                entity.ToTable(
                    "WeeklyComplianceCheckEntries",
                    table => table.HasCheckConstraint(
                        "CK_WeeklyComplianceCheckEntries_WeekRange",
                        "[WeekStartDate] <= [WeekEndDate]"));
            });

        ConfigureComplianceCheckEntryEntity<MonthlyComplianceCheckEntry>(
            modelBuilder,
            tableName: "MonthlyComplianceCheckEntries",
            frequency: ComplianceCheckFrequency.Monthly,
            configurePeriodColumns: entity =>
            {
                entity.Property(x => x.MonthStartDate).HasColumnType("date");
                entity.Property(x => x.MonthEndDate).HasColumnType("date");
                entity.Property(x => x.MonthNameValue).HasMaxLength(20).HasColumnName("MonthName");
                entity.Property(x => x.MonthNumberValue).HasColumnName("MonthNumber");
                entity.Property(x => x.MonthYearValue).HasColumnName("MonthYear");
                entity.HasIndex(x => new { x.ShopId, x.MonthStartDate, x.MonthEndDate });
                entity.HasIndex(x => new { x.ShopId, x.MonthYearValue, x.MonthNumberValue, x.ComplianceCheckItemId }).IsUnique();
                entity.ToTable(
                    "MonthlyComplianceCheckEntries",
                    table => table.HasCheckConstraint(
                        "CK_MonthlyComplianceCheckEntries_MonthRange",
                        "[MonthStartDate] <= [MonthEndDate]"));
                entity.ToTable(
                    "MonthlyComplianceCheckEntries",
                    table => table.HasCheckConstraint(
                        "CK_MonthlyComplianceCheckEntries_MonthNumber",
                        "[MonthNumber] >= 1 AND [MonthNumber] <= 12"));
            });

        modelBuilder.Entity<ComplianceCheckAttachment>(entity =>
        {
            entity.HasIndex(x => new { x.ComplianceCheckEntryId, x.Frequency });
            entity.HasIndex(x => x.ShopId);
            entity.Property(x => x.OriginalFileName).HasMaxLength(260).IsRequired();
            entity.Property(x => x.StoredFileName).HasMaxLength(320).IsRequired();
            entity.Property(x => x.StoredPath).HasMaxLength(1000).IsRequired();
            entity.Property(x => x.ContentType).HasMaxLength(120);
            entity.ToTable(
                "ComplianceCheckAttachments",
                table => table.HasCheckConstraint(
                    "CK_ComplianceCheckAttachments_Frequency",
                    $"[Frequency] >= {(int)ComplianceCheckFrequency.Daily} AND [Frequency] <= {(int)ComplianceCheckFrequency.Monthly}"));
            entity.HasOne(x => x.Shop).WithMany(x => x.ComplianceCheckAttachments).HasForeignKey(x => x.ShopId);
        });

        modelBuilder.Entity<RefusalRegisterEntry>(entity =>
        {
            entity.HasIndex(x => new { x.ShopId, x.RefusalDate });
            entity.HasIndex(x => new { x.ShopId, x.RefusalDate, x.SequenceNo }).IsUnique();
            entity.Property(x => x.Product).HasMaxLength(120).IsRequired();
            entity.Property(x => x.PersonDescription).HasMaxLength(300).IsRequired();
            entity.Property(x => x.Observations).HasMaxLength(1000);
            entity.Property(x => x.StaffMemberInitials).HasMaxLength(20).IsRequired();
            entity.Property(x => x.SignatureImagePath).HasMaxLength(1000);
            entity.Property(x => x.RecordedByName).HasMaxLength(200);
            entity.Property(x => x.ReviewedByName).HasMaxLength(200);
            entity.Property(x => x.ReviewNotes).HasMaxLength(1000);
            entity.Property(x => x.ReviewSignatureImagePath).HasMaxLength(1000);
            entity.HasOne(x => x.Shop).WithMany(x => x.RefusalRegisterEntries).HasForeignKey(x => x.ShopId);
        });

        modelBuilder.Entity<RefusalRegisterDailySignoff>(entity =>
        {
            entity.HasIndex(x => new { x.ShopId, x.SignoffDate }).IsUnique();
            entity.Property(x => x.SignedByInitials).HasMaxLength(20).IsRequired();
            entity.Property(x => x.SignedByName).HasMaxLength(200).IsRequired();
            entity.Property(x => x.Notes).HasMaxLength(1000);
            entity.Property(x => x.SignatureImagePath).HasMaxLength(1000);
            entity.HasOne(x => x.Shop).WithMany(x => x.RefusalRegisterDailySignoffs).HasForeignKey(x => x.ShopId);
        });

        modelBuilder.Entity<SubscriptionPlan>(entity =>
        {
            entity.HasIndex(x => new { x.BillingCycle, x.IsActive });
            entity.HasIndex(x => x.StripePriceId);
            entity.Property(x => x.Name).HasMaxLength(120).IsRequired();
            entity.Property(x => x.PricePerShop).HasPrecision(18, 2);
            entity.Property(x => x.Description).HasMaxLength(500);
            entity.Property(x => x.StripePriceId).HasMaxLength(200);
            // MaxUsers and ReportExportsPerMonth are nullable — null means unlimited.
        });

        modelBuilder.Entity<Feature>(entity =>
        {
            entity.HasIndex(x => x.Key).IsUnique();
            entity.HasIndex(x => new { x.Category, x.DisplayOrder });
            entity.Property(x => x.Key).HasMaxLength(120).IsRequired();
            entity.Property(x => x.Name).HasMaxLength(200).IsRequired();
            entity.Property(x => x.Description).HasMaxLength(1000);
            entity.Property(x => x.Category).HasMaxLength(100);
        });

        modelBuilder.Entity<SubscriptionPlanFeature>(entity =>
        {
            entity.HasIndex(x => new { x.SubscriptionPlanId, x.FeatureId }).IsUnique();
            entity.Property(x => x.Notes).HasMaxLength(500);
            entity.HasOne(x => x.SubscriptionPlan)
                .WithMany(x => x.PlanFeatures)
                .HasForeignKey(x => x.SubscriptionPlanId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.Feature)
                .WithMany(x => x.SubscriptionPlanFeatures)
                .HasForeignKey(x => x.FeatureId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<CfgTemperatureSchedule>(entity =>
        {
            entity.HasIndex(x => new { x.ShopId, x.IsActive });
            entity.Property(x => x.Label).HasMaxLength(200);
            entity.HasOne(x => x.Shop).WithMany().HasForeignKey(x => x.ShopId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.TemperatureMonitoringUnit).WithMany().HasForeignKey(x => x.TemperatureMonitoringUnitId).OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<CompanySubscription>(entity =>
        {
            entity.HasIndex(x => new { x.CompanyId, x.Status });
            entity.Property(x => x.PricePerShop).HasPrecision(18, 2);
            entity.Property(x => x.DiscountAmount).HasPrecision(18, 2);
            entity.Property(x => x.DiscountPercentage).HasPrecision(9, 4);
            entity.Property(x => x.SubTotalAmount).HasPrecision(18, 2);
            entity.Property(x => x.TotalAmount).HasPrecision(18, 2);
            entity.Property(x => x.PaymentProvider).HasMaxLength(50);
            entity.Property(x => x.ProviderCustomerId).HasMaxLength(200);
            entity.Property(x => x.ProviderSubscriptionId).HasMaxLength(200);
            entity.Property(x => x.ProviderPriceId).HasMaxLength(200);
            entity.HasOne(x => x.Company).WithMany(x => x.Subscriptions).HasForeignKey(x => x.CompanyId);
            entity.HasOne(x => x.SubscriptionPlan).WithMany(x => x.CompanySubscriptions).HasForeignKey(x => x.SubscriptionPlanId);
        });

        modelBuilder.Entity<ReportExportLog>(entity =>
        {
            entity.HasIndex(x => new { x.ShopId, x.ExportedOn });
            entity.Property(x => x.ReportType).HasMaxLength(100).IsRequired();
        });

        modelBuilder.Entity<ShopSubscription>(entity =>
        {
            entity.HasIndex(x => new { x.ShopId, x.Status });
            entity.HasIndex(x => x.CompanyId);
            entity.HasIndex(x => x.StripeSubscriptionId);
            entity.HasIndex(x => x.StripeCustomerId);
            // Background job for the 1-year pause cap scans by (Status, PausedOn).
            entity.HasIndex(x => new { x.Status, x.PausedOn });
            entity.Property(x => x.Price).HasPrecision(18, 2);
            entity.Property(x => x.PaymentProvider).HasMaxLength(50);
            entity.Property(x => x.ProviderProductId).HasMaxLength(200);
            entity.Property(x => x.ProviderSubscriptionId).HasMaxLength(200);
            entity.Property(x => x.ProviderOriginalTransactionId).HasMaxLength(200);
            entity.Property(x => x.StripeCustomerId).HasMaxLength(200);
            entity.Property(x => x.StripeSubscriptionId).HasMaxLength(200);
            entity.HasOne(x => x.Shop).WithMany().HasForeignKey(x => x.ShopId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.Company).WithMany().HasForeignKey(x => x.CompanyId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.SubscriptionPlan).WithMany().HasForeignKey(x => x.SubscriptionPlanId).OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<SubscriptionDiscountRule>(entity =>
        {
            entity.HasIndex(x => new { x.SubscriptionPlanId, x.MinShopCount, x.MaxShopCount });
            entity.Property(x => x.DiscountValue).HasPrecision(18, 4);
            entity.Property(x => x.Description).HasMaxLength(500);
            entity.HasOne(x => x.SubscriptionPlan).WithMany(x => x.DiscountRules).HasForeignKey(x => x.SubscriptionPlanId);
        });

        modelBuilder.Entity<SubscriptionInvoice>(entity =>
        {
            entity.HasIndex(x => x.InvoiceNumber).IsUnique();
            entity.HasIndex(x => new { x.CompanyId, x.CreatedOn });
            entity.Property(x => x.InvoiceNumber).HasMaxLength(60).IsRequired();
            entity.Property(x => x.PricePerShop).HasPrecision(18, 2);
            entity.Property(x => x.SubTotalAmount).HasPrecision(18, 2);
            entity.Property(x => x.DiscountAmount).HasPrecision(18, 2);
            entity.Property(x => x.TaxAmount).HasPrecision(18, 2);
            entity.Property(x => x.TotalAmount).HasPrecision(18, 2);
            entity.HasOne(x => x.Company).WithMany(x => x.SubscriptionInvoices).HasForeignKey(x => x.CompanyId);
            entity.HasOne(x => x.CompanySubscription).WithMany(x => x.Invoices).HasForeignKey(x => x.CompanySubscriptionId);
        });

        modelBuilder.Entity<SubscriptionInvoiceLine>(entity =>
        {
            entity.Property(x => x.Description).HasMaxLength(500).IsRequired();
            entity.Property(x => x.UnitPrice).HasPrecision(18, 2);
            entity.Property(x => x.DiscountAmount).HasPrecision(18, 2);
            entity.Property(x => x.LineTotal).HasPrecision(18, 2);
            entity.HasOne(x => x.SubscriptionInvoice).WithMany(x => x.Lines).HasForeignKey(x => x.SubscriptionInvoiceId);
        });

        modelBuilder.Entity<PaymentTransaction>(entity =>
        {
            entity.HasIndex(x => new { x.CompanyId, x.CreatedOn });
            entity.Property(x => x.PaymentProvider).HasMaxLength(50).IsRequired();
            entity.Property(x => x.ProviderTransactionId).HasMaxLength(200);
            entity.Property(x => x.Amount).HasPrecision(18, 2);
            entity.Property(x => x.Currency).HasMaxLength(10).IsRequired();
            entity.Property(x => x.FailedReason).HasMaxLength(1000);
            entity.Property(x => x.RawProviderResponse).HasMaxLength(8000);
            entity.HasOne(x => x.Company).WithMany(x => x.PaymentTransactions).HasForeignKey(x => x.CompanyId);
            entity.HasOne(x => x.CompanySubscription).WithMany(x => x.PaymentTransactions).HasForeignKey(x => x.CompanySubscriptionId);
            entity.HasOne(x => x.SubscriptionInvoice).WithMany(x => x.PaymentTransactions).HasForeignKey(x => x.SubscriptionInvoiceId);
        });

        modelBuilder.Entity<BillingEvent>(entity =>
        {
            entity.HasIndex(x => new { x.CompanyId, x.CreatedOn });
            entity.Property(x => x.Description).HasMaxLength(1000).IsRequired();
            entity.Property(x => x.OldValue).HasMaxLength(4000);
            entity.Property(x => x.NewValue).HasMaxLength(4000);
            entity.HasOne(x => x.Company).WithMany(x => x.BillingEvents).HasForeignKey(x => x.CompanyId);
            entity.HasOne(x => x.CompanySubscription).WithMany(x => x.BillingEvents).HasForeignKey(x => x.CompanySubscriptionId);
        });

        // SQL Server does not allow multiple cascade paths; keep delete behavior explicit.
        foreach (var foreignKey in modelBuilder.Model.GetEntityTypes().SelectMany(x => x.GetForeignKeys()))
        {
            if (!foreignKey.IsOwnership)
            {
                foreignKey.DeleteBehavior = DeleteBehavior.NoAction;
            }
        }
    }

    private static void ConfigureCfgSettings<TEntity>(
        ModelBuilder modelBuilder,
        Action<EntityTypeBuilder<TEntity>> configure)
        where TEntity : CfgSettingsBase
    {
        modelBuilder.Entity<TEntity>(entity =>
        {
            entity.HasIndex(x => x.ShopId).IsUnique();
            entity.Property(x => x.IsActive).HasDefaultValue(true);
            configure(entity);
        });
    }

    private static void ConfigureComplianceCheckEntryEntity<TEntity>(
        ModelBuilder modelBuilder,
        string tableName,
        ComplianceCheckFrequency frequency,
        Action<EntityTypeBuilder<TEntity>> configurePeriodColumns)
        where TEntity : ComplianceCheckEntry
    {
        modelBuilder.Entity<TEntity>(entity =>
        {
            entity.ToTable(
                tableName,
                table => table.HasCheckConstraint(
                    $"CK_{tableName}_Frequency",
                    $"[Frequency] = {(int)frequency}"));

            configurePeriodColumns(entity);
            entity.Property(x => x.Notes).HasMaxLength(1000);
            entity.Property(x => x.ActionRequired).HasMaxLength(1000);
            entity.Property(x => x.CheckedByName).HasMaxLength(200);
            entity.Property(x => x.ClosedOutNotes).HasMaxLength(1000);
            entity.Property(x => x.ClosedOutByName).HasMaxLength(200);
            entity.Property(x => x.IsActionClosedOut).HasDefaultValue(false);
            entity.Property(x => x.Result).HasDefaultValue(ComplianceCheckResult.Pending);
            entity.HasOne(x => x.Shop).WithMany(nameof(Shop.ComplianceCheckEntries)).HasForeignKey(x => x.ShopId);
            entity.HasOne(x => x.ComplianceCheckItem).WithMany(nameof(ComplianceCheckItem.Entries)).HasForeignKey(x => x.ComplianceCheckItemId);
            entity.HasOne<Company>().WithMany().HasForeignKey(x => x.CompanyId);
        });
    }
}
