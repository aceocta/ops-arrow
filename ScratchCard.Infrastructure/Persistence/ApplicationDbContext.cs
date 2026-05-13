using Microsoft.EntityFrameworkCore;
using ScratchCard.Domain.Entities;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Infrastructure.Persistence;

public class ApplicationDbContext : DbContext
{
    public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options) : base(options)
    {
    }

    public DbSet<User> Users => Set<User>();
    public DbSet<Role> Roles => Set<Role>();
    public DbSet<Company> Companies => Set<Company>();
    public DbSet<Shop> Shops => Set<Shop>();
    public DbSet<ShopUser> ShopUsers => Set<ShopUser>();
    public DbSet<UserInvitation> UserInvitations => Set<UserInvitation>();
    public DbSet<AppConfiguration> AppConfigurations => Set<AppConfiguration>();
    public DbSet<ScratchCardGame> ScratchCardGames => Set<ScratchCardGame>();
    public DbSet<ShopScratchCardGame> ShopScratchCardGames => Set<ShopScratchCardGame>();
    public DbSet<Delivery> Deliveries => Set<Delivery>();
    public DbSet<DeliveryPack> DeliveryPacks => Set<DeliveryPack>();
    public DbSet<ScratchCardPack> ScratchCardPacks => Set<ScratchCardPack>();
    public DbSet<BusinessDay> BusinessDays => Set<BusinessDay>();
    public DbSet<Shift> Shifts => Set<Shift>();
    public DbSet<ShiftScratchCardSale> ShiftScratchCardSales => Set<ShiftScratchCardSale>();
    public DbSet<PrizePayout> PrizePayouts => Set<PrizePayout>();
    public DbSet<ScratchCardDayCloseSummary> ScratchCardDayCloseSummaries => Set<ScratchCardDayCloseSummary>();
    public DbSet<ScratchCardDayReview> ScratchCardDayReviews => Set<ScratchCardDayReview>();
    public DbSet<ShiftReconciliation> ShiftReconciliations => Set<ShiftReconciliation>();
    public DbSet<ShiftCloseAttachment> ShiftCloseAttachments => Set<ShiftCloseAttachment>();
    public DbSet<BusinessDayCloseAttachment> BusinessDayCloseAttachments => Set<BusinessDayCloseAttachment>();
    public DbSet<NotificationLog> NotificationLogs => Set<NotificationLog>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<TemperatureMonitoringUnit> TemperatureMonitoringUnits => Set<TemperatureMonitoringUnit>();
    public DbSet<TemperatureReading> TemperatureReadings => Set<TemperatureReading>();
    public DbSet<TemperatureDailySignoff> TemperatureDailySignoffs => Set<TemperatureDailySignoff>();
    public DbSet<RefusalRegisterEntry> RefusalRegisterEntries => Set<RefusalRegisterEntry>();
    public DbSet<RefusalRegisterDailySignoff> RefusalRegisterDailySignoffs => Set<RefusalRegisterDailySignoff>();
    public DbSet<SubscriptionPlan> SubscriptionPlans => Set<SubscriptionPlan>();
    public DbSet<CompanySubscription> CompanySubscriptions => Set<CompanySubscription>();
    public DbSet<SubscriptionDiscountRule> SubscriptionDiscountRules => Set<SubscriptionDiscountRule>();
    public DbSet<SubscriptionInvoice> SubscriptionInvoices => Set<SubscriptionInvoice>();
    public DbSet<SubscriptionInvoiceLine> SubscriptionInvoiceLines => Set<SubscriptionInvoiceLine>();
    public DbSet<PaymentTransaction> PaymentTransactions => Set<PaymentTransaction>();
    public DbSet<BillingEvent> BillingEvents => Set<BillingEvent>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<User>(entity =>
        {
            entity.HasIndex(x => x.Email).IsUnique();
            entity.Property(x => x.Email).HasMaxLength(320).IsRequired();
            entity.Property(x => x.FirstName).HasMaxLength(100).IsRequired();
            entity.Property(x => x.LastName).HasMaxLength(100).IsRequired();
            entity.Property(x => x.ExternalProvider).HasMaxLength(100);
            entity.Property(x => x.ExternalProviderUserId).HasMaxLength(200);
        });

        modelBuilder.Entity<Role>(entity =>
        {
            entity.HasIndex(x => x.Name).IsUnique();
            entity.Property(x => x.Name).HasMaxLength(50).IsRequired();
            entity.Property(x => x.Description).HasMaxLength(300);
        });

        modelBuilder.Entity<Company>(entity =>
        {
            entity.HasIndex(x => x.CompanyName).IsUnique();
            entity.Property(x => x.CompanyName).HasMaxLength(200).IsRequired();
            entity.Property(x => x.RegistrationNumber).HasMaxLength(100);
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
            entity.HasIndex(x => new { x.CompanyId, x.ShopName });
            entity.Property(x => x.ShopName).HasMaxLength(200).IsRequired();
            entity.Property(x => x.AddressLine1).HasMaxLength(200).IsRequired();
            entity.Property(x => x.AddressLine2).HasMaxLength(200);
            entity.Property(x => x.City).HasMaxLength(100).IsRequired();
            entity.Property(x => x.PostCode).HasMaxLength(20).IsRequired();
            entity.Property(x => x.Country).HasMaxLength(100).IsRequired();
            entity.Property(x => x.IsDeleted).HasDefaultValue(false);
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

        modelBuilder.Entity<AppConfiguration>(entity =>
        {
            entity.HasIndex(x => new { x.ShopId, x.ConfigKey }).IsUnique();
            entity.Property(x => x.ConfigKey).HasMaxLength(150).IsRequired();
            entity.Property(x => x.ConfigValue).HasMaxLength(2000).IsRequired();
            entity.Property(x => x.DataType).HasMaxLength(40).IsRequired();
            entity.Property(x => x.GroupName).HasMaxLength(100).IsRequired();
            entity.Property(x => x.Description).HasMaxLength(500);
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
            entity.Property(x => x.ActualCash).HasPrecision(18, 2);
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
            entity.Property(x => x.ActualCash).HasPrecision(18, 2);
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
            entity.HasOne(x => x.Shop).WithMany(x => x.TemperatureReadings).HasForeignKey(x => x.ShopId);
            entity.HasOne(x => x.TemperatureMonitoringUnit).WithMany(x => x.Readings).HasForeignKey(x => x.TemperatureMonitoringUnitId);
        });

        modelBuilder.Entity<TemperatureDailySignoff>(entity =>
        {
            entity.HasIndex(x => new { x.ShopId, x.SignoffDate }).IsUnique();
            entity.Property(x => x.SignedByInitials).HasMaxLength(20).IsRequired();
            entity.Property(x => x.SignedByName).HasMaxLength(200).IsRequired();
            entity.Property(x => x.Notes).HasMaxLength(1000);
            entity.HasOne(x => x.Shop).WithMany(x => x.TemperatureDailySignoffs).HasForeignKey(x => x.ShopId);
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
            entity.Property(x => x.Name).HasMaxLength(120).IsRequired();
            entity.Property(x => x.PricePerShop).HasPrecision(18, 2);
            entity.Property(x => x.Description).HasMaxLength(500);
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
}
