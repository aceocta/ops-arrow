using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ScratchCard.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class init : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AuditLogs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    EntityName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    EntityId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ActionType = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    OldValue = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    NewValue = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    ChangedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ChangedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    Reason = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    IpAddress = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AuditLogs", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Features",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Key = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    Category = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    DisplayOrder = table.Column<int>(type: "int", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    IsSystem = table.Column<bool>(type: "bit", nullable: false),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Features", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "MasterScratchCardGames",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    GameName = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    GameCode = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                    TicketPrice = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    TicketsPerPack = table.Column<int>(type: "int", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    IsDeleted = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MasterScratchCardGames", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ReportExportLogs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ReportType = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    ExportedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ReportExportLogs", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Roles",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Roles", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "SignupEmailVerifications",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Email = table.Column<string>(type: "nvarchar(320)", maxLength: 320, nullable: false),
                    CodeHash = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    CodeLength = table.Column<int>(type: "int", nullable: false),
                    ExpiresOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    FailedAttempts = table.Column<int>(type: "int", nullable: false),
                    LastSentOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SignupEmailVerifications", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "SubscriptionPlans",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    BillingCycle = table.Column<int>(type: "int", nullable: false),
                    PricePerShop = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    TrialDays = table.Column<int>(type: "int", nullable: false),
                    Description = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    MaxUsers = table.Column<int>(type: "int", nullable: true),
                    ReportExportsPerMonth = table.Column<int>(type: "int", nullable: true),
                    AppleProductId = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    GoogleProductId = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SubscriptionPlans", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Users",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Email = table.Column<string>(type: "nvarchar(320)", maxLength: 320, nullable: false),
                    FirstName = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    LastName = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    ExternalProvider = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    ExternalProviderUserId = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    PasswordHash = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    PasswordResetTokenHash = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    PasswordResetTokenExpiresOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    LastLoginOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Users", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "SubscriptionDiscountRules",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SubscriptionPlanId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    MinShopCount = table.Column<int>(type: "int", nullable: false),
                    MaxShopCount = table.Column<int>(type: "int", nullable: true),
                    DiscountType = table.Column<int>(type: "int", nullable: false),
                    DiscountValue = table.Column<decimal>(type: "decimal(18,4)", precision: 18, scale: 4, nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    Description = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SubscriptionDiscountRules", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SubscriptionDiscountRules_SubscriptionPlans_SubscriptionPlanId",
                        column: x => x.SubscriptionPlanId,
                        principalTable: "SubscriptionPlans",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "SubscriptionPlanFeatures",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SubscriptionPlanId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FeatureId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    IsEnabled = table.Column<bool>(type: "bit", nullable: false),
                    LimitValue = table.Column<int>(type: "int", nullable: true),
                    Notes = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SubscriptionPlanFeatures", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SubscriptionPlanFeatures_Features_FeatureId",
                        column: x => x.FeatureId,
                        principalTable: "Features",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_SubscriptionPlanFeatures_SubscriptionPlans_SubscriptionPlanId",
                        column: x => x.SubscriptionPlanId,
                        principalTable: "SubscriptionPlans",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "Companies",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CompanyName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    RegistrationNumber = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    OwnerUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Email = table.Column<string>(type: "nvarchar(320)", maxLength: 320, nullable: false),
                    PhoneNumber = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: true),
                    AddressLine1 = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    AddressLine2 = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    City = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    PostCode = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: true),
                    Country = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false, defaultValue: "UK"),
                    Status = table.Column<int>(type: "int", nullable: false, defaultValue: 1),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    IsDeleted = table.Column<bool>(type: "bit", nullable: false, defaultValue: false),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Companies", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Companies_Users_OwnerUserId",
                        column: x => x.OwnerUserId,
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "UserRoles",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RoleId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    AssignedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserRoles", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UserRoles_Roles_RoleId",
                        column: x => x.RoleId,
                        principalTable: "Roles",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_UserRoles_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "CompanySubscriptions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SubscriptionPlanId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    BillingCycle = table.Column<int>(type: "int", nullable: false),
                    PricePerShop = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    ActiveShopCount = table.Column<int>(type: "int", nullable: false),
                    DiscountAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    DiscountPercentage = table.Column<decimal>(type: "decimal(9,4)", precision: 9, scale: 4, nullable: false),
                    SubTotalAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    TotalAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    TrialStartedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    TrialEndsOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CurrentPeriodStartedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CurrentPeriodEndsOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CancelledOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CancelAtPeriodEnd = table.Column<bool>(type: "bit", nullable: false),
                    PaymentProvider = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: true),
                    ProviderCustomerId = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    ProviderSubscriptionId = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    ProviderPriceId = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CompanySubscriptions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CompanySubscriptions_Companies_CompanyId",
                        column: x => x.CompanyId,
                        principalTable: "Companies",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_CompanySubscriptions_SubscriptionPlans_SubscriptionPlanId",
                        column: x => x.SubscriptionPlanId,
                        principalTable: "SubscriptionPlans",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "Shops",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ShopName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    AddressLine1 = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    AddressLine2 = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    City = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    PostCode = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    Country = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    IsDeleted = table.Column<bool>(type: "bit", nullable: false, defaultValue: false),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Shops", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Shops_Companies_CompanyId",
                        column: x => x.CompanyId,
                        principalTable: "Companies",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "BillingEvents",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CompanySubscriptionId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    EventType = table.Column<int>(type: "int", nullable: false),
                    Description = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    OldValue = table.Column<string>(type: "nvarchar(4000)", maxLength: 4000, nullable: true),
                    NewValue = table.Column<string>(type: "nvarchar(4000)", maxLength: 4000, nullable: true),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BillingEvents", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BillingEvents_Companies_CompanyId",
                        column: x => x.CompanyId,
                        principalTable: "Companies",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_BillingEvents_CompanySubscriptions_CompanySubscriptionId",
                        column: x => x.CompanySubscriptionId,
                        principalTable: "CompanySubscriptions",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "SubscriptionInvoices",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CompanySubscriptionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    InvoiceNumber = table.Column<string>(type: "nvarchar(60)", maxLength: 60, nullable: false),
                    BillingCycle = table.Column<int>(type: "int", nullable: false),
                    ActiveShopCount = table.Column<int>(type: "int", nullable: false),
                    PricePerShop = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    SubTotalAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    DiscountAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    TaxAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    TotalAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    DueDate = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    PaidOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SubscriptionInvoices", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SubscriptionInvoices_Companies_CompanyId",
                        column: x => x.CompanyId,
                        principalTable: "Companies",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_SubscriptionInvoices_CompanySubscriptions_CompanySubscriptionId",
                        column: x => x.CompanySubscriptionId,
                        principalTable: "CompanySubscriptions",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "BusinessDays",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    BusinessDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    OpenedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OpenedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    ClosedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ClosedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    TotalSalesAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    TotalPrizePayout = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    ExpectedCash = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Difference = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Notes = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BusinessDays", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BusinessDays_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "Canisters",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CanisterNumber = table.Column<string>(type: "nvarchar(60)", maxLength: 60, nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false, defaultValue: true),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Canisters", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Canisters_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "CfgBarcodeSettings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    EnableMobileCameraBarcodeScanning = table.Column<bool>(type: "bit", nullable: true),
                    AllowManualEntryIfScanFails = table.Column<bool>(type: "bit", nullable: true),
                    BarcodeContains = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    PackNumberStartPosition = table.Column<int>(type: "int", nullable: true),
                    PackNumberLength = table.Column<int>(type: "int", nullable: true),
                    SerialNumberStartPosition = table.Column<int>(type: "int", nullable: true),
                    BarcodeSerialNumberLength = table.Column<int>(type: "int", nullable: true),
                    RemovePrefix = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    RemoveSuffix = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    IsActive = table.Column<bool>(type: "bit", nullable: false, defaultValue: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CfgBarcodeSettings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CfgBarcodeSettings_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "CfgDayCloseSettings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RequireDayEndClose = table.Column<bool>(type: "bit", nullable: true),
                    AllowDayReopen = table.Column<bool>(type: "bit", nullable: true),
                    WhoCanReopenDay = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    RequireAllShiftsClosedBeforeDayClose = table.Column<bool>(type: "bit", nullable: true),
                    RequireNoteWhenDayDifferenceExists = table.Column<bool>(type: "bit", nullable: true),
                    EnableSafeDropManagement = table.Column<bool>(type: "bit", nullable: true),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    IsActive = table.Column<bool>(type: "bit", nullable: false, defaultValue: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CfgDayCloseSettings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CfgDayCloseSettings_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "CfgGeneralSettings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: true),
                    TimeZone = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    BusinessStartTime = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: true),
                    BusinessEndTime = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: true),
                    BusinessDateCutOffTime = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: true),
                    EnableAuditLog = table.Column<bool>(type: "bit", nullable: true),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    IsActive = table.Column<bool>(type: "bit", nullable: false, defaultValue: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CfgGeneralSettings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CfgGeneralSettings_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "CfgNotificationSettings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    NotificationChannels = table.Column<string>(type: "nvarchar(400)", maxLength: 400, nullable: true),
                    ManualEntryNotificationRecipients = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    CashDifferenceNotificationRecipients = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    HighPrizePayoutNotificationRecipients = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    SendNotificationOnShiftFinalize = table.Column<bool>(type: "bit", nullable: true),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    IsActive = table.Column<bool>(type: "bit", nullable: false, defaultValue: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CfgNotificationSettings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CfgNotificationSettings_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "CfgOfflineSettings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    EnableOfflineShiftClose = table.Column<bool>(type: "bit", nullable: true),
                    AllowOfflinePrizePayout = table.Column<bool>(type: "bit", nullable: true),
                    AllowOfflineShiftReconciliation = table.Column<bool>(type: "bit", nullable: true),
                    AutoSyncWhenOnline = table.Column<bool>(type: "bit", nullable: true),
                    ConflictRequiresManagerReview = table.Column<bool>(type: "bit", nullable: true),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    IsActive = table.Column<bool>(type: "bit", nullable: false, defaultValue: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CfgOfflineSettings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CfgOfflineSettings_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "CfgPackSettings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DefaultSellingOrder = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: true),
                    PackSellingOrder = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: true),
                    ScratchCardDisplayCount = table.Column<int>(type: "int", nullable: true),
                    AllowLeadingZeros = table.Column<bool>(type: "bit", nullable: true),
                    PreventDuplicatePackNumbers = table.Column<bool>(type: "bit", nullable: true),
                    RequirePackActivationBeforeSale = table.Column<bool>(type: "bit", nullable: true),
                    AllowMultipleActivePacksForSameGame = table.Column<bool>(type: "bit", nullable: true),
                    AutoCompletePackWhenFinalSerialReached = table.Column<bool>(type: "bit", nullable: true),
                    AllowPackPause = table.Column<bool>(type: "bit", nullable: true),
                    AllowPackReturn = table.Column<bool>(type: "bit", nullable: true),
                    AllowIssueMarking = table.Column<bool>(type: "bit", nullable: true),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    IsActive = table.Column<bool>(type: "bit", nullable: false, defaultValue: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CfgPackSettings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CfgPackSettings_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "CfgPrizePayoutSettings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RequirePackNumberForPayout = table.Column<bool>(type: "bit", nullable: true),
                    RequireTicketNumberForPayout = table.Column<bool>(type: "bit", nullable: true),
                    CashierPayoutLimit = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: true),
                    ManagerApprovalAboveLimit = table.Column<bool>(type: "bit", nullable: true),
                    PreventDuplicatePayoutForSameTicket = table.Column<bool>(type: "bit", nullable: true),
                    AllowedPayoutMethods = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    IsActive = table.Column<bool>(type: "bit", nullable: false, defaultValue: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CfgPrizePayoutSettings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CfgPrizePayoutSettings_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "CfgSalesSettings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AllowBackdatedSales = table.Column<bool>(type: "bit", nullable: true),
                    MaximumBackdateDays = table.Column<int>(type: "int", nullable: true),
                    AllowFutureDatedSales = table.Column<bool>(type: "bit", nullable: true),
                    RequireManagerApprovalForCorrection = table.Column<bool>(type: "bit", nullable: true),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    IsActive = table.Column<bool>(type: "bit", nullable: false, defaultValue: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CfgSalesSettings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CfgSalesSettings_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "CfgShiftSettings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RequireShiftClose = table.Column<bool>(type: "bit", nullable: true),
                    AllowShiftReopen = table.Column<bool>(type: "bit", nullable: true),
                    WhoCanReopenShift = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    ShiftStartTime = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: true),
                    ShiftEndTime = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: true),
                    ShiftDefaultName = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    ShiftTemplates = table.Column<string>(type: "nvarchar(4000)", maxLength: 4000, nullable: true),
                    EnforceShiftTimeWindow = table.Column<bool>(type: "bit", nullable: true),
                    AllowCustomShiftName = table.Column<bool>(type: "bit", nullable: true),
                    RequireReasonForManualClosingSerial = table.Column<bool>(type: "bit", nullable: true),
                    NotifyOnManualClosingSerialEntry = table.Column<bool>(type: "bit", nullable: true),
                    NotifyOnScannedSerialEdit = table.Column<bool>(type: "bit", nullable: true),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    IsActive = table.Column<bool>(type: "bit", nullable: false, defaultValue: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CfgShiftSettings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CfgShiftSettings_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "CfgSubscriptionSettings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DefaultTrialDays = table.Column<int>(type: "int", nullable: true),
                    TrialEndingReminderDays = table.Column<int>(type: "int", nullable: true),
                    PaymentGracePeriodDays = table.Column<int>(type: "int", nullable: true),
                    BulkDiscountEnabled = table.Column<bool>(type: "bit", nullable: true),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    IsActive = table.Column<bool>(type: "bit", nullable: false, defaultValue: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CfgSubscriptionSettings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CfgSubscriptionSettings_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "ComplianceCheckAttachments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ComplianceCheckEntryId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Frequency = table.Column<int>(type: "int", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OriginalFileName = table.Column<string>(type: "nvarchar(260)", maxLength: 260, nullable: false),
                    StoredFileName = table.Column<string>(type: "nvarchar(320)", maxLength: 320, nullable: false),
                    StoredPath = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    ContentType = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: true),
                    FileSizeBytes = table.Column<long>(type: "bigint", nullable: false),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ComplianceCheckAttachments", x => x.Id);
                    table.CheckConstraint("CK_ComplianceCheckAttachments_Frequency", "[Frequency] >= 1 AND [Frequency] <= 3");
                    table.ForeignKey(
                        name: "FK_ComplianceCheckAttachments_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "ComplianceCheckGroups",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Frequency = table.Column<int>(type: "int", nullable: false),
                    GroupName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    DisplayOrder = table.Column<int>(type: "int", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false, defaultValue: true),
                    IsSystemDefault = table.Column<bool>(type: "bit", nullable: false, defaultValue: false),
                    IsDeleted = table.Column<bool>(type: "bit", nullable: false, defaultValue: false),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ComplianceCheckGroups", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ComplianceCheckGroups_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "Deliveries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DeliveryDate = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    SupplierName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    DeliveryReference = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    ReceivedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Notes = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Deliveries", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Deliveries_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "NotificationLogs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    NotificationType = table.Column<int>(type: "int", nullable: false),
                    Channel = table.Column<int>(type: "int", nullable: false),
                    Recipient = table.Column<string>(type: "nvarchar(320)", maxLength: 320, nullable: false),
                    Subject = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    Message = table.Column<string>(type: "nvarchar(4000)", maxLength: 4000, nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    SentOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    FailedReason = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    RelatedEntityName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    RelatedEntityId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_NotificationLogs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_NotificationLogs_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "RefusalRegisterDailySignoffs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SignoffDate = table.Column<DateOnly>(type: "date", nullable: false),
                    SignedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SignedByInitials = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    SignedByName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    SignedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    Notes = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    SignatureImagePath = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RefusalRegisterDailySignoffs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RefusalRegisterDailySignoffs_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "RefusalRegisterEntries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SequenceNo = table.Column<int>(type: "int", nullable: false),
                    RefusalDate = table.Column<DateOnly>(type: "date", nullable: false),
                    RefusalTime = table.Column<TimeOnly>(type: "time", nullable: false),
                    Product = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    PersonDescription = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: false),
                    Observations = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    StaffMemberInitials = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    SignatureImagePath = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    RecordedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    RecordedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    RecordedByName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    ReviewedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ReviewedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ReviewedByName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    ReviewNotes = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    ReviewSignatureImagePath = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RefusalRegisterEntries", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RefusalRegisterEntries_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "ScratchCardPacks",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    GameId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PackNumber = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    DisplayNumber = table.Column<int>(type: "int", nullable: true),
                    TicketPrice = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    TotalTickets = table.Column<int>(type: "int", nullable: false),
                    StartSerialNumber = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                    EndSerialNumber = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                    SellingOrder = table.Column<int>(type: "int", nullable: false),
                    CurrentSerialNumber = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    IsManuallyAdded = table.Column<bool>(type: "bit", nullable: false, defaultValue: false),
                    ReceivedDate = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    ActivatedDate = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ActivatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CompletedDate = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ReturnedDate = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    Notes = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    IsDeleted = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ScratchCardPacks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ScratchCardPacks_MasterScratchCardGames_GameId",
                        column: x => x.GameId,
                        principalTable: "MasterScratchCardGames",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_ScratchCardPacks_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "ShopChecklistGroups",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    GroupName = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    DisplayOrder = table.Column<int>(type: "int", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false, defaultValue: true),
                    IsSystemDefault = table.Column<bool>(type: "bit", nullable: false, defaultValue: false),
                    IsDeleted = table.Column<bool>(type: "bit", nullable: false, defaultValue: false),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ShopChecklistGroups", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ShopChecklistGroups_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "ShopScratchCardGames",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MasterGameId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    DefaultStartSerialNumber = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                    DefaultEndSerialNumber = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                    DefaultSellingOrder = table.Column<int>(type: "int", nullable: false),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    IsDeleted = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ShopScratchCardGames", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ShopScratchCardGames_MasterScratchCardGames_MasterGameId",
                        column: x => x.MasterGameId,
                        principalTable: "MasterScratchCardGames",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_ShopScratchCardGames_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "ShopSubscriptions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SubscriptionPlanId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Status = table.Column<int>(type: "int", nullable: false),
                    BillingCycle = table.Column<int>(type: "int", nullable: false),
                    Price = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    TrialStartedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    TrialEndsOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CurrentPeriodStartedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CurrentPeriodEndsOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CancelledOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CancelAtPeriodEnd = table.Column<bool>(type: "bit", nullable: false),
                    PaymentProvider = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: true),
                    ProviderProductId = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    ProviderSubscriptionId = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    ProviderOriginalTransactionId = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ShopSubscriptions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ShopSubscriptions_Companies_CompanyId",
                        column: x => x.CompanyId,
                        principalTable: "Companies",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_ShopSubscriptions_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_ShopSubscriptions_SubscriptionPlans_SubscriptionPlanId",
                        column: x => x.SubscriptionPlanId,
                        principalTable: "SubscriptionPlans",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "ShopUsers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RoleId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    JoinedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    InvitedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ShopUsers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ShopUsers_Roles_RoleId",
                        column: x => x.RoleId,
                        principalTable: "Roles",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_ShopUsers_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_ShopUsers_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "TemperatureDailySignoffs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SignoffDate = table.Column<DateOnly>(type: "date", nullable: false),
                    SignedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SignedByInitials = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    SignedByName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    SignedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    Notes = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TemperatureDailySignoffs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TemperatureDailySignoffs_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "TemperatureMonitoringUnits",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UnitName = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    EquipmentType = table.Column<int>(type: "int", nullable: false),
                    MinTemperatureCelsius = table.Column<decimal>(type: "decimal(5,2)", precision: 5, scale: 2, nullable: false),
                    MaxTemperatureCelsius = table.Column<decimal>(type: "decimal(5,2)", precision: 5, scale: 2, nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    Location = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    Notes = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    IsDeleted = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TemperatureMonitoringUnits", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TemperatureMonitoringUnits_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "UserInvitations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Email = table.Column<string>(type: "nvarchar(320)", maxLength: 320, nullable: false),
                    RoleId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    InvitationTokenHash = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    ExpiresOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    AcceptedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    AcceptedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CancelledOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CancelledByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    InvitedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserInvitations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UserInvitations_Roles_RoleId",
                        column: x => x.RoleId,
                        principalTable: "Roles",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_UserInvitations_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "UserPushTokens",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PushToken = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: false),
                    Platform = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    DeviceName = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: true),
                    IsActive = table.Column<bool>(type: "bit", nullable: false, defaultValue: true),
                    RegisteredOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserPushTokens", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UserPushTokens_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_UserPushTokens_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "PaymentTransactions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CompanySubscriptionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SubscriptionInvoiceId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    PaymentProvider = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    ProviderTransactionId = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    Amount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(10)", maxLength: 10, nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    PaidOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    FailedReason = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    RawProviderResponse = table.Column<string>(type: "nvarchar(max)", maxLength: 8000, nullable: true),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PaymentTransactions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PaymentTransactions_Companies_CompanyId",
                        column: x => x.CompanyId,
                        principalTable: "Companies",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_PaymentTransactions_CompanySubscriptions_CompanySubscriptionId",
                        column: x => x.CompanySubscriptionId,
                        principalTable: "CompanySubscriptions",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_PaymentTransactions_SubscriptionInvoices_SubscriptionInvoiceId",
                        column: x => x.SubscriptionInvoiceId,
                        principalTable: "SubscriptionInvoices",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "SubscriptionInvoiceLines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SubscriptionInvoiceId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Description = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    Quantity = table.Column<int>(type: "int", nullable: false),
                    UnitPrice = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    DiscountAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    LineTotal = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SubscriptionInvoiceLines", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SubscriptionInvoiceLines_SubscriptionInvoices_SubscriptionInvoiceId",
                        column: x => x.SubscriptionInvoiceId,
                        principalTable: "SubscriptionInvoices",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "BusinessDayCloseAttachments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    BusinessDayId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OriginalFileName = table.Column<string>(type: "nvarchar(260)", maxLength: 260, nullable: false),
                    StoredFileName = table.Column<string>(type: "nvarchar(320)", maxLength: 320, nullable: false),
                    StoredPath = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    ContentType = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: true),
                    FileSizeBytes = table.Column<long>(type: "bigint", nullable: false),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BusinessDayCloseAttachments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BusinessDayCloseAttachments_BusinessDays_BusinessDayId",
                        column: x => x.BusinessDayId,
                        principalTable: "BusinessDays",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_BusinessDayCloseAttachments_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "ScratchCardDayCloseSummaries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    BusinessDayId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    LottoPayout = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    ScratchCardPayout = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    TillPayout = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ScratchCardDayCloseSummaries", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ScratchCardDayCloseSummaries_BusinessDays_BusinessDayId",
                        column: x => x.BusinessDayId,
                        principalTable: "BusinessDays",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "ScratchCardDayReviews",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    BusinessDayId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TillPayout = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: true),
                    ScratchCardSummaryPayout = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: true),
                    Note = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    ReviewedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ReviewedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ScratchCardDayReviews", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ScratchCardDayReviews_BusinessDays_BusinessDayId",
                        column: x => x.BusinessDayId,
                        principalTable: "BusinessDays",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_ScratchCardDayReviews_Users_ReviewedByUserId",
                        column: x => x.ReviewedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "Shifts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    BusinessDayId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShiftName = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    StartTime = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    EndTime = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    OpenedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ClosedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    OpenedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ClosedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Status = table.Column<int>(type: "int", nullable: false),
                    SyncStatus = table.Column<int>(type: "int", nullable: false),
                    Notes = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Shifts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Shifts_BusinessDays_BusinessDayId",
                        column: x => x.BusinessDayId,
                        principalTable: "BusinessDays",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_Shifts_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "ComplianceCheckItems",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ComplianceCheckGroupId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Frequency = table.Column<int>(type: "int", nullable: false),
                    ItemName = table.Column<string>(type: "nvarchar(260)", maxLength: 260, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    DisplayOrder = table.Column<int>(type: "int", nullable: false),
                    IsRequired = table.Column<bool>(type: "bit", nullable: false, defaultValue: true),
                    IsActive = table.Column<bool>(type: "bit", nullable: false, defaultValue: true),
                    IsSystemDefault = table.Column<bool>(type: "bit", nullable: false, defaultValue: false),
                    IsDeleted = table.Column<bool>(type: "bit", nullable: false, defaultValue: false),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ComplianceCheckItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ComplianceCheckItems_ComplianceCheckGroups_ComplianceCheckGroupId",
                        column: x => x.ComplianceCheckGroupId,
                        principalTable: "ComplianceCheckGroups",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_ComplianceCheckItems_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "DeliveryPacks",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DeliveryId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ScratchCardPackId = table.Column<Guid>(type: "uniqueidentifier", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DeliveryPacks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DeliveryPacks_Deliveries_DeliveryId",
                        column: x => x.DeliveryId,
                        principalTable: "Deliveries",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_DeliveryPacks_ScratchCardPacks_ScratchCardPackId",
                        column: x => x.ScratchCardPackId,
                        principalTable: "ScratchCardPacks",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "ShopChecklistTasks",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ChecklistGroupId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TaskName = table.Column<string>(type: "nvarchar(180)", maxLength: 180, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(800)", maxLength: 800, nullable: true),
                    DisplayOrder = table.Column<int>(type: "int", nullable: false),
                    IsRequired = table.Column<bool>(type: "bit", nullable: false, defaultValue: true),
                    IsActive = table.Column<bool>(type: "bit", nullable: false, defaultValue: true),
                    NotesRequiredOnComplete = table.Column<bool>(type: "bit", nullable: false, defaultValue: false),
                    RequiredForShopOpen = table.Column<bool>(type: "bit", nullable: false, defaultValue: false),
                    RequiredForShiftClose = table.Column<bool>(type: "bit", nullable: false, defaultValue: false),
                    RequiredForDayClose = table.Column<bool>(type: "bit", nullable: false, defaultValue: false),
                    IsSystemDefault = table.Column<bool>(type: "bit", nullable: false, defaultValue: false),
                    IsDeleted = table.Column<bool>(type: "bit", nullable: false, defaultValue: false),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ShopChecklistTasks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ShopChecklistTasks_ShopChecklistGroups_ChecklistGroupId",
                        column: x => x.ChecklistGroupId,
                        principalTable: "ShopChecklistGroups",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_ShopChecklistTasks_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "TemperatureReadings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TemperatureMonitoringUnitId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ReadingDate = table.Column<DateOnly>(type: "date", nullable: false),
                    ReadingTime = table.Column<TimeOnly>(type: "time", nullable: false),
                    TemperatureCelsius = table.Column<decimal>(type: "decimal(5,2)", precision: 5, scale: 2, nullable: false),
                    IsOutOfRange = table.Column<bool>(type: "bit", nullable: false),
                    CheckedByInitials = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    Notes = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    ActionTaken = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    RecordedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    RecordedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    RecordedByName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TemperatureReadings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TemperatureReadings_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_TemperatureReadings_TemperatureMonitoringUnits_TemperatureMonitoringUnitId",
                        column: x => x.TemperatureMonitoringUnitId,
                        principalTable: "TemperatureMonitoringUnits",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "CanisterDrops",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    BusinessDayId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShiftId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CanisterId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    DroppedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    DroppedByName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    DroppedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CanisterDrops", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CanisterDrops_BusinessDays_BusinessDayId",
                        column: x => x.BusinessDayId,
                        principalTable: "BusinessDays",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_CanisterDrops_Canisters_CanisterId",
                        column: x => x.CanisterId,
                        principalTable: "Canisters",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_CanisterDrops_Shifts_ShiftId",
                        column: x => x.ShiftId,
                        principalTable: "Shifts",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_CanisterDrops_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "PrizePayouts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    BusinessDayId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShiftId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PackId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    TicketNumber = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: true),
                    PrizeAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    PaymentMethod = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    ApprovalStatus = table.Column<int>(type: "int", nullable: false),
                    PaidByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PaidOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    ApprovedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ApprovedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    Notes = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PrizePayouts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PrizePayouts_BusinessDays_BusinessDayId",
                        column: x => x.BusinessDayId,
                        principalTable: "BusinessDays",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_PrizePayouts_ScratchCardPacks_PackId",
                        column: x => x.PackId,
                        principalTable: "ScratchCardPacks",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_PrizePayouts_Shifts_ShiftId",
                        column: x => x.ShiftId,
                        principalTable: "Shifts",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_PrizePayouts_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "ShiftOpeningSerials",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShiftId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    BusinessDayId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PackId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ExpectedOpeningSerialNumber = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                    ActualOpeningSerialNumber = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                    MissingQuantity = table.Column<int>(type: "int", nullable: false),
                    OverageQuantity = table.Column<int>(type: "int", nullable: false),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ShiftOpeningSerials", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ShiftOpeningSerials_BusinessDays_BusinessDayId",
                        column: x => x.BusinessDayId,
                        principalTable: "BusinessDays",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_ShiftOpeningSerials_ScratchCardPacks_PackId",
                        column: x => x.PackId,
                        principalTable: "ScratchCardPacks",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_ShiftOpeningSerials_Shifts_ShiftId",
                        column: x => x.ShiftId,
                        principalTable: "Shifts",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_ShiftOpeningSerials_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "ShiftReconciliations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShiftId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TotalSalesAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    TotalPrizePayout = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    ExpectedCash = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Difference = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    SubmittedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SubmittedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    ApprovedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ApprovedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    Notes = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ShiftReconciliations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ShiftReconciliations_Shifts_ShiftId",
                        column: x => x.ShiftId,
                        principalTable: "Shifts",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_ShiftReconciliations_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "ShiftScratchCardSales",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShiftId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PackId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OpeningSerialNumber = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                    ClosingSerialNumber = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                    OriginalScannedSerialNumber = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: true),
                    SellingOrder = table.Column<int>(type: "int", nullable: false),
                    EntryMethod = table.Column<int>(type: "int", nullable: false),
                    SoldQuantity = table.Column<int>(type: "int", nullable: false),
                    TicketPrice = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    SalesAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    RemainingTickets = table.Column<int>(type: "int", nullable: false),
                    IsManualEntry = table.Column<bool>(type: "bit", nullable: false),
                    IsScannedEdited = table.Column<bool>(type: "bit", nullable: false),
                    IsFlaggedForReview = table.Column<bool>(type: "bit", nullable: false),
                    ManualEntryReason = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    NotificationRequired = table.Column<bool>(type: "bit", nullable: false),
                    NotificationSent = table.Column<bool>(type: "bit", nullable: false),
                    NotificationSentOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    EnteredByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    EnteredOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    Notes = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ShiftScratchCardSales", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ShiftScratchCardSales_ScratchCardPacks_PackId",
                        column: x => x.PackId,
                        principalTable: "ScratchCardPacks",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_ShiftScratchCardSales_Shifts_ShiftId",
                        column: x => x.ShiftId,
                        principalTable: "Shifts",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_ShiftScratchCardSales_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "DailyComplianceCheckEntries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ComplianceCheckItemId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Frequency = table.Column<int>(type: "int", nullable: false),
                    Result = table.Column<int>(type: "int", nullable: false, defaultValue: 0),
                    Notes = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    ActionRequired = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    CheckedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CheckedByName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    CheckedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    IsActionClosedOut = table.Column<bool>(type: "bit", nullable: false, defaultValue: false),
                    ClosedOutNotes = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    ClosedOutByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ClosedOutByName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    ClosedOutOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CheckDate = table.Column<DateOnly>(type: "date", nullable: false),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DailyComplianceCheckEntries", x => x.Id);
                    table.CheckConstraint("CK_DailyComplianceCheckEntries_Frequency", "[Frequency] = 1");
                    table.ForeignKey(
                        name: "FK_DailyComplianceCheckEntries_Companies_CompanyId",
                        column: x => x.CompanyId,
                        principalTable: "Companies",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_DailyComplianceCheckEntries_ComplianceCheckItems_ComplianceCheckItemId",
                        column: x => x.ComplianceCheckItemId,
                        principalTable: "ComplianceCheckItems",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_DailyComplianceCheckEntries_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "MonthlyComplianceCheckEntries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ComplianceCheckItemId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Frequency = table.Column<int>(type: "int", nullable: false),
                    Result = table.Column<int>(type: "int", nullable: false, defaultValue: 0),
                    Notes = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    ActionRequired = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    CheckedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CheckedByName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    CheckedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    IsActionClosedOut = table.Column<bool>(type: "bit", nullable: false, defaultValue: false),
                    ClosedOutNotes = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    ClosedOutByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ClosedOutByName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    ClosedOutOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    MonthStartDate = table.Column<DateOnly>(type: "date", nullable: false),
                    MonthEndDate = table.Column<DateOnly>(type: "date", nullable: false),
                    MonthName = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    MonthNumber = table.Column<int>(type: "int", nullable: false),
                    MonthYear = table.Column<int>(type: "int", nullable: false),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MonthlyComplianceCheckEntries", x => x.Id);
                    table.CheckConstraint("CK_MonthlyComplianceCheckEntries_Frequency", "[Frequency] = 3");
                    table.CheckConstraint("CK_MonthlyComplianceCheckEntries_MonthNumber", "[MonthNumber] >= 1 AND [MonthNumber] <= 12");
                    table.CheckConstraint("CK_MonthlyComplianceCheckEntries_MonthRange", "[MonthStartDate] <= [MonthEndDate]");
                    table.ForeignKey(
                        name: "FK_MonthlyComplianceCheckEntries_Companies_CompanyId",
                        column: x => x.CompanyId,
                        principalTable: "Companies",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_MonthlyComplianceCheckEntries_ComplianceCheckItems_ComplianceCheckItemId",
                        column: x => x.ComplianceCheckItemId,
                        principalTable: "ComplianceCheckItems",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_MonthlyComplianceCheckEntries_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "WeeklyComplianceCheckEntries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ComplianceCheckItemId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Frequency = table.Column<int>(type: "int", nullable: false),
                    Result = table.Column<int>(type: "int", nullable: false, defaultValue: 0),
                    Notes = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    ActionRequired = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    CheckedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CheckedByName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    CheckedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    IsActionClosedOut = table.Column<bool>(type: "bit", nullable: false, defaultValue: false),
                    ClosedOutNotes = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    ClosedOutByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ClosedOutByName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    ClosedOutOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    WeekStartDate = table.Column<DateOnly>(type: "date", nullable: false),
                    WeekEndDate = table.Column<DateOnly>(type: "date", nullable: false),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WeeklyComplianceCheckEntries", x => x.Id);
                    table.CheckConstraint("CK_WeeklyComplianceCheckEntries_Frequency", "[Frequency] = 2");
                    table.CheckConstraint("CK_WeeklyComplianceCheckEntries_WeekRange", "[WeekStartDate] <= [WeekEndDate]");
                    table.ForeignKey(
                        name: "FK_WeeklyComplianceCheckEntries_Companies_CompanyId",
                        column: x => x.CompanyId,
                        principalTable: "Companies",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_WeeklyComplianceCheckEntries_ComplianceCheckItems_ComplianceCheckItemId",
                        column: x => x.ComplianceCheckItemId,
                        principalTable: "ComplianceCheckItems",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_WeeklyComplianceCheckEntries_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "ShopChecklistTaskCompletions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    BusinessDate = table.Column<DateOnly>(type: "date", nullable: false),
                    ShiftId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ChecklistGroupId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ChecklistTaskId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    IsCompleted = table.Column<bool>(type: "bit", nullable: false, defaultValue: false),
                    CompletedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CompletedByName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    CompletedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    Notes = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ShopChecklistTaskCompletions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ShopChecklistTaskCompletions_Companies_CompanyId",
                        column: x => x.CompanyId,
                        principalTable: "Companies",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_ShopChecklistTaskCompletions_Shifts_ShiftId",
                        column: x => x.ShiftId,
                        principalTable: "Shifts",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_ShopChecklistTaskCompletions_ShopChecklistGroups_ChecklistGroupId",
                        column: x => x.ChecklistGroupId,
                        principalTable: "ShopChecklistGroups",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_ShopChecklistTaskCompletions_ShopChecklistTasks_ChecklistTaskId",
                        column: x => x.ChecklistTaskId,
                        principalTable: "ShopChecklistTasks",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_ShopChecklistTaskCompletions_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "ShiftCloseAttachments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShiftReconciliationId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OriginalFileName = table.Column<string>(type: "nvarchar(260)", maxLength: 260, nullable: false),
                    StoredFileName = table.Column<string>(type: "nvarchar(320)", maxLength: 320, nullable: false),
                    StoredPath = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    ContentType = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: true),
                    FileSizeBytes = table.Column<long>(type: "bigint", nullable: false),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ShiftCloseAttachments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ShiftCloseAttachments_ShiftReconciliations_ShiftReconciliationId",
                        column: x => x.ShiftReconciliationId,
                        principalTable: "ShiftReconciliations",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_ShiftCloseAttachments_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_BillingEvents_CompanyId_CreatedOn",
                table: "BillingEvents",
                columns: new[] { "CompanyId", "CreatedOn" });

            migrationBuilder.CreateIndex(
                name: "IX_BillingEvents_CompanySubscriptionId",
                table: "BillingEvents",
                column: "CompanySubscriptionId");

            migrationBuilder.CreateIndex(
                name: "IX_BusinessDayCloseAttachments_BusinessDayId",
                table: "BusinessDayCloseAttachments",
                column: "BusinessDayId");

            migrationBuilder.CreateIndex(
                name: "IX_BusinessDayCloseAttachments_ShopId",
                table: "BusinessDayCloseAttachments",
                column: "ShopId");

            migrationBuilder.CreateIndex(
                name: "IX_BusinessDays_ShopId_BusinessDate",
                table: "BusinessDays",
                columns: new[] { "ShopId", "BusinessDate" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CanisterDrops_BusinessDayId_ShiftId_DroppedOn",
                table: "CanisterDrops",
                columns: new[] { "BusinessDayId", "ShiftId", "DroppedOn" });

            migrationBuilder.CreateIndex(
                name: "IX_CanisterDrops_CanisterId",
                table: "CanisterDrops",
                column: "CanisterId");

            migrationBuilder.CreateIndex(
                name: "IX_CanisterDrops_ShiftId",
                table: "CanisterDrops",
                column: "ShiftId");

            migrationBuilder.CreateIndex(
                name: "IX_CanisterDrops_ShopId_DroppedOn",
                table: "CanisterDrops",
                columns: new[] { "ShopId", "DroppedOn" });

            migrationBuilder.CreateIndex(
                name: "IX_Canisters_ShopId_CanisterNumber",
                table: "Canisters",
                columns: new[] { "ShopId", "CanisterNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Canisters_ShopId_IsActive",
                table: "Canisters",
                columns: new[] { "ShopId", "IsActive" });

            migrationBuilder.CreateIndex(
                name: "IX_CfgBarcodeSettings_ShopId",
                table: "CfgBarcodeSettings",
                column: "ShopId",
                unique: true,
                filter: "[ShopId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_CfgDayCloseSettings_ShopId",
                table: "CfgDayCloseSettings",
                column: "ShopId",
                unique: true,
                filter: "[ShopId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_CfgGeneralSettings_ShopId",
                table: "CfgGeneralSettings",
                column: "ShopId",
                unique: true,
                filter: "[ShopId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_CfgNotificationSettings_ShopId",
                table: "CfgNotificationSettings",
                column: "ShopId",
                unique: true,
                filter: "[ShopId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_CfgOfflineSettings_ShopId",
                table: "CfgOfflineSettings",
                column: "ShopId",
                unique: true,
                filter: "[ShopId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_CfgPackSettings_ShopId",
                table: "CfgPackSettings",
                column: "ShopId",
                unique: true,
                filter: "[ShopId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_CfgPrizePayoutSettings_ShopId",
                table: "CfgPrizePayoutSettings",
                column: "ShopId",
                unique: true,
                filter: "[ShopId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_CfgSalesSettings_ShopId",
                table: "CfgSalesSettings",
                column: "ShopId",
                unique: true,
                filter: "[ShopId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_CfgShiftSettings_ShopId",
                table: "CfgShiftSettings",
                column: "ShopId",
                unique: true,
                filter: "[ShopId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_CfgSubscriptionSettings_ShopId",
                table: "CfgSubscriptionSettings",
                column: "ShopId",
                unique: true,
                filter: "[ShopId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Companies_CompanyName",
                table: "Companies",
                column: "CompanyName",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Companies_OwnerUserId",
                table: "Companies",
                column: "OwnerUserId");

            migrationBuilder.CreateIndex(
                name: "IX_CompanySubscriptions_CompanyId_Status",
                table: "CompanySubscriptions",
                columns: new[] { "CompanyId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_CompanySubscriptions_SubscriptionPlanId",
                table: "CompanySubscriptions",
                column: "SubscriptionPlanId");

            migrationBuilder.CreateIndex(
                name: "IX_ComplianceCheckAttachments_ComplianceCheckEntryId_Frequency",
                table: "ComplianceCheckAttachments",
                columns: new[] { "ComplianceCheckEntryId", "Frequency" });

            migrationBuilder.CreateIndex(
                name: "IX_ComplianceCheckAttachments_ShopId",
                table: "ComplianceCheckAttachments",
                column: "ShopId");

            migrationBuilder.CreateIndex(
                name: "IX_ComplianceCheckGroups_ShopId_Frequency_DisplayOrder",
                table: "ComplianceCheckGroups",
                columns: new[] { "ShopId", "Frequency", "DisplayOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_ComplianceCheckGroups_ShopId_Frequency_GroupName_IsDeleted",
                table: "ComplianceCheckGroups",
                columns: new[] { "ShopId", "Frequency", "GroupName", "IsDeleted" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ComplianceCheckItems_ComplianceCheckGroupId_ItemName_IsDeleted",
                table: "ComplianceCheckItems",
                columns: new[] { "ComplianceCheckGroupId", "ItemName", "IsDeleted" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ComplianceCheckItems_ShopId_ComplianceCheckGroupId_DisplayOrder",
                table: "ComplianceCheckItems",
                columns: new[] { "ShopId", "ComplianceCheckGroupId", "DisplayOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_DailyComplianceCheckEntries_CompanyId",
                table: "DailyComplianceCheckEntries",
                column: "CompanyId");

            migrationBuilder.CreateIndex(
                name: "IX_DailyComplianceCheckEntries_ComplianceCheckItemId",
                table: "DailyComplianceCheckEntries",
                column: "ComplianceCheckItemId");

            migrationBuilder.CreateIndex(
                name: "IX_DailyComplianceCheckEntries_ShopId",
                table: "DailyComplianceCheckEntries",
                column: "ShopId");

            migrationBuilder.CreateIndex(
                name: "IX_DailyComplianceCheckEntries_ShopId_CheckDate",
                table: "DailyComplianceCheckEntries",
                columns: new[] { "ShopId", "CheckDate" });

            migrationBuilder.CreateIndex(
                name: "IX_DailyComplianceCheckEntries_ShopId_CheckDate_ComplianceCheckItemId",
                table: "DailyComplianceCheckEntries",
                columns: new[] { "ShopId", "CheckDate", "ComplianceCheckItemId" },
                unique: true,
                filter: "[CheckDate] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Deliveries_ShopId",
                table: "Deliveries",
                column: "ShopId");

            migrationBuilder.CreateIndex(
                name: "IX_DeliveryPacks_DeliveryId_ScratchCardPackId",
                table: "DeliveryPacks",
                columns: new[] { "DeliveryId", "ScratchCardPackId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_DeliveryPacks_ScratchCardPackId",
                table: "DeliveryPacks",
                column: "ScratchCardPackId");

            migrationBuilder.CreateIndex(
                name: "IX_Features_Category_DisplayOrder",
                table: "Features",
                columns: new[] { "Category", "DisplayOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_Features_Key",
                table: "Features",
                column: "Key",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MasterScratchCardGames_GameCode",
                table: "MasterScratchCardGames",
                column: "GameCode",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MonthlyComplianceCheckEntries_CompanyId",
                table: "MonthlyComplianceCheckEntries",
                column: "CompanyId");

            migrationBuilder.CreateIndex(
                name: "IX_MonthlyComplianceCheckEntries_ComplianceCheckItemId",
                table: "MonthlyComplianceCheckEntries",
                column: "ComplianceCheckItemId");

            migrationBuilder.CreateIndex(
                name: "IX_MonthlyComplianceCheckEntries_ShopId",
                table: "MonthlyComplianceCheckEntries",
                column: "ShopId");

            migrationBuilder.CreateIndex(
                name: "IX_MonthlyComplianceCheckEntries_ShopId_MonthStartDate_MonthEndDate",
                table: "MonthlyComplianceCheckEntries",
                columns: new[] { "ShopId", "MonthStartDate", "MonthEndDate" });

            migrationBuilder.CreateIndex(
                name: "IX_MonthlyComplianceCheckEntries_ShopId_MonthYear_MonthNumber_ComplianceCheckItemId",
                table: "MonthlyComplianceCheckEntries",
                columns: new[] { "ShopId", "MonthYear", "MonthNumber", "ComplianceCheckItemId" },
                unique: true,
                filter: "[MonthYear] IS NOT NULL AND [MonthNumber] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_NotificationLogs_ShopId",
                table: "NotificationLogs",
                column: "ShopId");

            migrationBuilder.CreateIndex(
                name: "IX_PaymentTransactions_CompanyId_CreatedOn",
                table: "PaymentTransactions",
                columns: new[] { "CompanyId", "CreatedOn" });

            migrationBuilder.CreateIndex(
                name: "IX_PaymentTransactions_CompanySubscriptionId",
                table: "PaymentTransactions",
                column: "CompanySubscriptionId");

            migrationBuilder.CreateIndex(
                name: "IX_PaymentTransactions_SubscriptionInvoiceId",
                table: "PaymentTransactions",
                column: "SubscriptionInvoiceId");

            migrationBuilder.CreateIndex(
                name: "IX_PrizePayouts_BusinessDayId",
                table: "PrizePayouts",
                column: "BusinessDayId");

            migrationBuilder.CreateIndex(
                name: "IX_PrizePayouts_PackId",
                table: "PrizePayouts",
                column: "PackId");

            migrationBuilder.CreateIndex(
                name: "IX_PrizePayouts_ShiftId_PackId_TicketNumber",
                table: "PrizePayouts",
                columns: new[] { "ShiftId", "PackId", "TicketNumber" });

            migrationBuilder.CreateIndex(
                name: "IX_PrizePayouts_ShopId",
                table: "PrizePayouts",
                column: "ShopId");

            migrationBuilder.CreateIndex(
                name: "IX_RefusalRegisterDailySignoffs_ShopId_SignoffDate",
                table: "RefusalRegisterDailySignoffs",
                columns: new[] { "ShopId", "SignoffDate" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_RefusalRegisterEntries_ShopId_RefusalDate",
                table: "RefusalRegisterEntries",
                columns: new[] { "ShopId", "RefusalDate" });

            migrationBuilder.CreateIndex(
                name: "IX_RefusalRegisterEntries_ShopId_RefusalDate_SequenceNo",
                table: "RefusalRegisterEntries",
                columns: new[] { "ShopId", "RefusalDate", "SequenceNo" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ReportExportLogs_ShopId_ExportedOn",
                table: "ReportExportLogs",
                columns: new[] { "ShopId", "ExportedOn" });

            migrationBuilder.CreateIndex(
                name: "IX_Roles_Name",
                table: "Roles",
                column: "Name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ScratchCardDayCloseSummaries_BusinessDayId",
                table: "ScratchCardDayCloseSummaries",
                column: "BusinessDayId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ScratchCardDayReviews_BusinessDayId",
                table: "ScratchCardDayReviews",
                column: "BusinessDayId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ScratchCardDayReviews_ReviewedByUserId",
                table: "ScratchCardDayReviews",
                column: "ReviewedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ScratchCardPacks_GameId",
                table: "ScratchCardPacks",
                column: "GameId");

            migrationBuilder.CreateIndex(
                name: "IX_ScratchCardPacks_ShopId_PackNumber",
                table: "ScratchCardPacks",
                columns: new[] { "ShopId", "PackNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ShiftCloseAttachments_ShiftReconciliationId",
                table: "ShiftCloseAttachments",
                column: "ShiftReconciliationId");

            migrationBuilder.CreateIndex(
                name: "IX_ShiftCloseAttachments_ShopId",
                table: "ShiftCloseAttachments",
                column: "ShopId");

            migrationBuilder.CreateIndex(
                name: "IX_ShiftOpeningSerials_BusinessDayId_ShopId",
                table: "ShiftOpeningSerials",
                columns: new[] { "BusinessDayId", "ShopId" });

            migrationBuilder.CreateIndex(
                name: "IX_ShiftOpeningSerials_PackId",
                table: "ShiftOpeningSerials",
                column: "PackId");

            migrationBuilder.CreateIndex(
                name: "IX_ShiftOpeningSerials_ShiftId_PackId",
                table: "ShiftOpeningSerials",
                columns: new[] { "ShiftId", "PackId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ShiftOpeningSerials_ShopId",
                table: "ShiftOpeningSerials",
                column: "ShopId");

            migrationBuilder.CreateIndex(
                name: "IX_ShiftReconciliations_ShiftId",
                table: "ShiftReconciliations",
                column: "ShiftId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ShiftReconciliations_ShopId",
                table: "ShiftReconciliations",
                column: "ShopId");

            migrationBuilder.CreateIndex(
                name: "IX_Shifts_BusinessDayId_ShiftName",
                table: "Shifts",
                columns: new[] { "BusinessDayId", "ShiftName" });

            migrationBuilder.CreateIndex(
                name: "IX_Shifts_ShopId",
                table: "Shifts",
                column: "ShopId");

            migrationBuilder.CreateIndex(
                name: "IX_ShiftScratchCardSales_PackId",
                table: "ShiftScratchCardSales",
                column: "PackId");

            migrationBuilder.CreateIndex(
                name: "IX_ShiftScratchCardSales_ShiftId",
                table: "ShiftScratchCardSales",
                column: "ShiftId");

            migrationBuilder.CreateIndex(
                name: "IX_ShiftScratchCardSales_ShopId",
                table: "ShiftScratchCardSales",
                column: "ShopId");

            migrationBuilder.CreateIndex(
                name: "IX_ShopChecklistGroups_ShopId_DisplayOrder",
                table: "ShopChecklistGroups",
                columns: new[] { "ShopId", "DisplayOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_ShopChecklistGroups_ShopId_GroupName_IsDeleted",
                table: "ShopChecklistGroups",
                columns: new[] { "ShopId", "GroupName", "IsDeleted" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ShopChecklistGroups_ShopId_IsDeleted",
                table: "ShopChecklistGroups",
                columns: new[] { "ShopId", "IsDeleted" });

            migrationBuilder.CreateIndex(
                name: "IX_ShopChecklistTaskCompletions_ChecklistGroupId_ChecklistTaskId",
                table: "ShopChecklistTaskCompletions",
                columns: new[] { "ChecklistGroupId", "ChecklistTaskId" });

            migrationBuilder.CreateIndex(
                name: "IX_ShopChecklistTaskCompletions_ChecklistTaskId",
                table: "ShopChecklistTaskCompletions",
                column: "ChecklistTaskId");

            migrationBuilder.CreateIndex(
                name: "IX_ShopChecklistTaskCompletions_CompanyId",
                table: "ShopChecklistTaskCompletions",
                column: "CompanyId");

            migrationBuilder.CreateIndex(
                name: "IX_ShopChecklistTaskCompletions_ShiftId",
                table: "ShopChecklistTaskCompletions",
                column: "ShiftId");

            migrationBuilder.CreateIndex(
                name: "IX_ShopChecklistTaskCompletions_ShopId_BusinessDate",
                table: "ShopChecklistTaskCompletions",
                columns: new[] { "ShopId", "BusinessDate" });

            migrationBuilder.CreateIndex(
                name: "IX_ShopChecklistTaskCompletions_ShopId_BusinessDate_ChecklistTaskId",
                table: "ShopChecklistTaskCompletions",
                columns: new[] { "ShopId", "BusinessDate", "ChecklistTaskId" },
                unique: true,
                filter: "[ShiftId] IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_ShopChecklistTaskCompletions_ShopId_BusinessDate_ShiftId_ChecklistTaskId",
                table: "ShopChecklistTaskCompletions",
                columns: new[] { "ShopId", "BusinessDate", "ShiftId", "ChecklistTaskId" },
                unique: true,
                filter: "[ShiftId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_ShopChecklistTasks_ChecklistGroupId_DisplayOrder",
                table: "ShopChecklistTasks",
                columns: new[] { "ChecklistGroupId", "DisplayOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_ShopChecklistTasks_ChecklistGroupId_TaskName_IsDeleted",
                table: "ShopChecklistTasks",
                columns: new[] { "ChecklistGroupId", "TaskName", "IsDeleted" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ShopChecklistTasks_ShopId_IsDeleted",
                table: "ShopChecklistTasks",
                columns: new[] { "ShopId", "IsDeleted" });

            migrationBuilder.CreateIndex(
                name: "IX_Shops_CompanyId_ShopName",
                table: "Shops",
                columns: new[] { "CompanyId", "ShopName" });

            migrationBuilder.CreateIndex(
                name: "IX_ShopScratchCardGames_MasterGameId",
                table: "ShopScratchCardGames",
                column: "MasterGameId");

            migrationBuilder.CreateIndex(
                name: "IX_ShopScratchCardGames_ShopId_MasterGameId_IsDeleted",
                table: "ShopScratchCardGames",
                columns: new[] { "ShopId", "MasterGameId", "IsDeleted" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ShopSubscriptions_CompanyId",
                table: "ShopSubscriptions",
                column: "CompanyId");

            migrationBuilder.CreateIndex(
                name: "IX_ShopSubscriptions_ShopId_Status",
                table: "ShopSubscriptions",
                columns: new[] { "ShopId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_ShopSubscriptions_SubscriptionPlanId",
                table: "ShopSubscriptions",
                column: "SubscriptionPlanId");

            migrationBuilder.CreateIndex(
                name: "IX_ShopUsers_RoleId",
                table: "ShopUsers",
                column: "RoleId");

            migrationBuilder.CreateIndex(
                name: "IX_ShopUsers_ShopId_UserId",
                table: "ShopUsers",
                columns: new[] { "ShopId", "UserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ShopUsers_UserId",
                table: "ShopUsers",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_SignupEmailVerifications_Email",
                table: "SignupEmailVerifications",
                column: "Email",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SubscriptionDiscountRules_SubscriptionPlanId_MinShopCount_MaxShopCount",
                table: "SubscriptionDiscountRules",
                columns: new[] { "SubscriptionPlanId", "MinShopCount", "MaxShopCount" });

            migrationBuilder.CreateIndex(
                name: "IX_SubscriptionInvoiceLines_SubscriptionInvoiceId",
                table: "SubscriptionInvoiceLines",
                column: "SubscriptionInvoiceId");

            migrationBuilder.CreateIndex(
                name: "IX_SubscriptionInvoices_CompanyId_CreatedOn",
                table: "SubscriptionInvoices",
                columns: new[] { "CompanyId", "CreatedOn" });

            migrationBuilder.CreateIndex(
                name: "IX_SubscriptionInvoices_CompanySubscriptionId",
                table: "SubscriptionInvoices",
                column: "CompanySubscriptionId");

            migrationBuilder.CreateIndex(
                name: "IX_SubscriptionInvoices_InvoiceNumber",
                table: "SubscriptionInvoices",
                column: "InvoiceNumber",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SubscriptionPlanFeatures_FeatureId",
                table: "SubscriptionPlanFeatures",
                column: "FeatureId");

            migrationBuilder.CreateIndex(
                name: "IX_SubscriptionPlanFeatures_SubscriptionPlanId_FeatureId",
                table: "SubscriptionPlanFeatures",
                columns: new[] { "SubscriptionPlanId", "FeatureId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SubscriptionPlans_BillingCycle_IsActive",
                table: "SubscriptionPlans",
                columns: new[] { "BillingCycle", "IsActive" });

            migrationBuilder.CreateIndex(
                name: "IX_TemperatureDailySignoffs_ShopId_SignoffDate",
                table: "TemperatureDailySignoffs",
                columns: new[] { "ShopId", "SignoffDate" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TemperatureMonitoringUnits_ShopId_UnitName_IsDeleted",
                table: "TemperatureMonitoringUnits",
                columns: new[] { "ShopId", "UnitName", "IsDeleted" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TemperatureReadings_ShopId_ReadingDate",
                table: "TemperatureReadings",
                columns: new[] { "ShopId", "ReadingDate" });

            migrationBuilder.CreateIndex(
                name: "IX_TemperatureReadings_TemperatureMonitoringUnitId_ReadingDate_ReadingTime",
                table: "TemperatureReadings",
                columns: new[] { "TemperatureMonitoringUnitId", "ReadingDate", "ReadingTime" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_UserInvitations_InvitationTokenHash",
                table: "UserInvitations",
                column: "InvitationTokenHash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_UserInvitations_RoleId",
                table: "UserInvitations",
                column: "RoleId");

            migrationBuilder.CreateIndex(
                name: "IX_UserInvitations_ShopId",
                table: "UserInvitations",
                column: "ShopId");

            migrationBuilder.CreateIndex(
                name: "IX_UserPushTokens_ShopId_IsActive",
                table: "UserPushTokens",
                columns: new[] { "ShopId", "IsActive" });

            migrationBuilder.CreateIndex(
                name: "IX_UserPushTokens_ShopId_UserId_PushToken",
                table: "UserPushTokens",
                columns: new[] { "ShopId", "UserId", "PushToken" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_UserPushTokens_UserId_IsActive",
                table: "UserPushTokens",
                columns: new[] { "UserId", "IsActive" });

            migrationBuilder.CreateIndex(
                name: "IX_UserRoles_RoleId",
                table: "UserRoles",
                column: "RoleId");

            migrationBuilder.CreateIndex(
                name: "IX_UserRoles_UserId_IsActive",
                table: "UserRoles",
                columns: new[] { "UserId", "IsActive" });

            migrationBuilder.CreateIndex(
                name: "IX_UserRoles_UserId_RoleId",
                table: "UserRoles",
                columns: new[] { "UserId", "RoleId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Users_Email",
                table: "Users",
                column: "Email",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Users_PasswordResetTokenHash",
                table: "Users",
                column: "PasswordResetTokenHash");

            migrationBuilder.CreateIndex(
                name: "IX_WeeklyComplianceCheckEntries_CompanyId",
                table: "WeeklyComplianceCheckEntries",
                column: "CompanyId");

            migrationBuilder.CreateIndex(
                name: "IX_WeeklyComplianceCheckEntries_ComplianceCheckItemId",
                table: "WeeklyComplianceCheckEntries",
                column: "ComplianceCheckItemId");

            migrationBuilder.CreateIndex(
                name: "IX_WeeklyComplianceCheckEntries_ShopId",
                table: "WeeklyComplianceCheckEntries",
                column: "ShopId");

            migrationBuilder.CreateIndex(
                name: "IX_WeeklyComplianceCheckEntries_ShopId_WeekStartDate_WeekEndDate",
                table: "WeeklyComplianceCheckEntries",
                columns: new[] { "ShopId", "WeekStartDate", "WeekEndDate" });

            migrationBuilder.CreateIndex(
                name: "IX_WeeklyComplianceCheckEntries_ShopId_WeekStartDate_WeekEndDate_ComplianceCheckItemId",
                table: "WeeklyComplianceCheckEntries",
                columns: new[] { "ShopId", "WeekStartDate", "WeekEndDate", "ComplianceCheckItemId" },
                unique: true,
                filter: "[WeekStartDate] IS NOT NULL AND [WeekEndDate] IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AuditLogs");

            migrationBuilder.DropTable(
                name: "BillingEvents");

            migrationBuilder.DropTable(
                name: "BusinessDayCloseAttachments");

            migrationBuilder.DropTable(
                name: "CanisterDrops");

            migrationBuilder.DropTable(
                name: "CfgBarcodeSettings");

            migrationBuilder.DropTable(
                name: "CfgDayCloseSettings");

            migrationBuilder.DropTable(
                name: "CfgGeneralSettings");

            migrationBuilder.DropTable(
                name: "CfgNotificationSettings");

            migrationBuilder.DropTable(
                name: "CfgOfflineSettings");

            migrationBuilder.DropTable(
                name: "CfgPackSettings");

            migrationBuilder.DropTable(
                name: "CfgPrizePayoutSettings");

            migrationBuilder.DropTable(
                name: "CfgSalesSettings");

            migrationBuilder.DropTable(
                name: "CfgShiftSettings");

            migrationBuilder.DropTable(
                name: "CfgSubscriptionSettings");

            migrationBuilder.DropTable(
                name: "ComplianceCheckAttachments");

            migrationBuilder.DropTable(
                name: "DailyComplianceCheckEntries");

            migrationBuilder.DropTable(
                name: "DeliveryPacks");

            migrationBuilder.DropTable(
                name: "MonthlyComplianceCheckEntries");

            migrationBuilder.DropTable(
                name: "NotificationLogs");

            migrationBuilder.DropTable(
                name: "PaymentTransactions");

            migrationBuilder.DropTable(
                name: "PrizePayouts");

            migrationBuilder.DropTable(
                name: "RefusalRegisterDailySignoffs");

            migrationBuilder.DropTable(
                name: "RefusalRegisterEntries");

            migrationBuilder.DropTable(
                name: "ReportExportLogs");

            migrationBuilder.DropTable(
                name: "ScratchCardDayCloseSummaries");

            migrationBuilder.DropTable(
                name: "ScratchCardDayReviews");

            migrationBuilder.DropTable(
                name: "ShiftCloseAttachments");

            migrationBuilder.DropTable(
                name: "ShiftOpeningSerials");

            migrationBuilder.DropTable(
                name: "ShiftScratchCardSales");

            migrationBuilder.DropTable(
                name: "ShopChecklistTaskCompletions");

            migrationBuilder.DropTable(
                name: "ShopScratchCardGames");

            migrationBuilder.DropTable(
                name: "ShopSubscriptions");

            migrationBuilder.DropTable(
                name: "ShopUsers");

            migrationBuilder.DropTable(
                name: "SignupEmailVerifications");

            migrationBuilder.DropTable(
                name: "SubscriptionDiscountRules");

            migrationBuilder.DropTable(
                name: "SubscriptionInvoiceLines");

            migrationBuilder.DropTable(
                name: "SubscriptionPlanFeatures");

            migrationBuilder.DropTable(
                name: "TemperatureDailySignoffs");

            migrationBuilder.DropTable(
                name: "TemperatureReadings");

            migrationBuilder.DropTable(
                name: "UserInvitations");

            migrationBuilder.DropTable(
                name: "UserPushTokens");

            migrationBuilder.DropTable(
                name: "UserRoles");

            migrationBuilder.DropTable(
                name: "WeeklyComplianceCheckEntries");

            migrationBuilder.DropTable(
                name: "Canisters");

            migrationBuilder.DropTable(
                name: "Deliveries");

            migrationBuilder.DropTable(
                name: "ShiftReconciliations");

            migrationBuilder.DropTable(
                name: "ScratchCardPacks");

            migrationBuilder.DropTable(
                name: "ShopChecklistTasks");

            migrationBuilder.DropTable(
                name: "SubscriptionInvoices");

            migrationBuilder.DropTable(
                name: "Features");

            migrationBuilder.DropTable(
                name: "TemperatureMonitoringUnits");

            migrationBuilder.DropTable(
                name: "Roles");

            migrationBuilder.DropTable(
                name: "ComplianceCheckItems");

            migrationBuilder.DropTable(
                name: "Shifts");

            migrationBuilder.DropTable(
                name: "MasterScratchCardGames");

            migrationBuilder.DropTable(
                name: "ShopChecklistGroups");

            migrationBuilder.DropTable(
                name: "CompanySubscriptions");

            migrationBuilder.DropTable(
                name: "ComplianceCheckGroups");

            migrationBuilder.DropTable(
                name: "BusinessDays");

            migrationBuilder.DropTable(
                name: "SubscriptionPlans");

            migrationBuilder.DropTable(
                name: "Shops");

            migrationBuilder.DropTable(
                name: "Companies");

            migrationBuilder.DropTable(
                name: "Users");
        }
    }
}
