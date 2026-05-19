using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ScratchCard.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class SplitComplianceCheckEntriesByPeriodShape : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
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
                unique: true);

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
                unique: true);

            migrationBuilder.Sql("""
                IF EXISTS (SELECT 1 FROM [ComplianceCheckEntries] WHERE [Frequency] NOT IN (1, 2, 3))
                    THROW 50000, 'Unexpected compliance check frequency value found in ComplianceCheckEntries.', 1;
                """);

            migrationBuilder.Sql("""
                INSERT INTO [DailyComplianceCheckEntries]
                (
                    [Id], [ShopId], [CompanyId], [ComplianceCheckItemId], [Frequency], [Result], [Notes],
                    [ActionRequired], [CheckedByUserId], [CheckedByName], [CheckedOn], [IsActionClosedOut], [ClosedOutNotes],
                    [ClosedOutByUserId], [ClosedOutByName], [ClosedOutOn], [CheckDate], [CreatedOn], [CreatedBy], [ModifiedOn], [ModifiedBy]
                )
                SELECT
                    [Id], [ShopId], [CompanyId], [ComplianceCheckItemId], [Frequency], [Result], [Notes],
                    [ActionRequired], [CheckedByUserId], [CheckedByName], [CheckedOn], [IsActionClosedOut], [ClosedOutNotes],
                    [ClosedOutByUserId], [ClosedOutByName], [ClosedOutOn], [PeriodDate], [CreatedOn], [CreatedBy], [ModifiedOn], [ModifiedBy]
                FROM [ComplianceCheckEntries]
                WHERE [Frequency] = 1;
                """);

            migrationBuilder.Sql("""
                INSERT INTO [WeeklyComplianceCheckEntries]
                (
                    [Id], [ShopId], [CompanyId], [ComplianceCheckItemId], [Frequency], [Result], [Notes],
                    [ActionRequired], [CheckedByUserId], [CheckedByName], [CheckedOn], [IsActionClosedOut], [ClosedOutNotes],
                    [ClosedOutByUserId], [ClosedOutByName], [ClosedOutOn], [WeekStartDate], [WeekEndDate], [CreatedOn], [CreatedBy], [ModifiedOn], [ModifiedBy]
                )
                SELECT
                    [Id], [ShopId], [CompanyId], [ComplianceCheckItemId], [Frequency], [Result], [Notes],
                    [ActionRequired], [CheckedByUserId], [CheckedByName], [CheckedOn], [IsActionClosedOut], [ClosedOutNotes],
                    [ClosedOutByUserId], [ClosedOutByName], [ClosedOutOn], [PeriodDate], DATEADD(DAY, 6, [PeriodDate]), [CreatedOn], [CreatedBy], [ModifiedOn], [ModifiedBy]
                FROM [ComplianceCheckEntries]
                WHERE [Frequency] = 2;
                """);

            migrationBuilder.Sql("""
                INSERT INTO [MonthlyComplianceCheckEntries]
                (
                    [Id], [ShopId], [CompanyId], [ComplianceCheckItemId], [Frequency], [Result], [Notes],
                    [ActionRequired], [CheckedByUserId], [CheckedByName], [CheckedOn], [IsActionClosedOut], [ClosedOutNotes],
                    [ClosedOutByUserId], [ClosedOutByName], [ClosedOutOn], [MonthStartDate], [MonthEndDate], [MonthName], [MonthNumber], [MonthYear],
                    [CreatedOn], [CreatedBy], [ModifiedOn], [ModifiedBy]
                )
                SELECT
                    [Id], [ShopId], [CompanyId], [ComplianceCheckItemId], [Frequency], [Result], [Notes],
                    [ActionRequired], [CheckedByUserId], [CheckedByName], [CheckedOn], [IsActionClosedOut], [ClosedOutNotes],
                    [ClosedOutByUserId], [ClosedOutByName], [ClosedOutOn], DATEFROMPARTS(YEAR([PeriodDate]), MONTH([PeriodDate]), 1), EOMONTH([PeriodDate]), DATENAME(MONTH, [PeriodDate]), MONTH([PeriodDate]), YEAR([PeriodDate]),
                    [CreatedOn], [CreatedBy], [ModifiedOn], [ModifiedBy]
                FROM [ComplianceCheckEntries]
                WHERE [Frequency] = 3;
                """);

            migrationBuilder.DropTable(
                name: "ComplianceCheckEntries");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ComplianceCheckEntries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ComplianceCheckItemId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ActionRequired = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    CheckedByName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    CheckedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CheckedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ClosedOutByName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    ClosedOutByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ClosedOutNotes = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    ClosedOutOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CompanyId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    Frequency = table.Column<int>(type: "int", nullable: false),
                    IsActionClosedOut = table.Column<bool>(type: "bit", nullable: false, defaultValue: false),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    Notes = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    PeriodDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Result = table.Column<int>(type: "int", nullable: false, defaultValue: 0)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ComplianceCheckEntries", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ComplianceCheckEntries_Companies_CompanyId",
                        column: x => x.CompanyId,
                        principalTable: "Companies",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_ComplianceCheckEntries_ComplianceCheckItems_ComplianceCheckItemId",
                        column: x => x.ComplianceCheckItemId,
                        principalTable: "ComplianceCheckItems",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_ComplianceCheckEntries_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_ComplianceCheckEntries_CompanyId",
                table: "ComplianceCheckEntries",
                column: "CompanyId");

            migrationBuilder.CreateIndex(
                name: "IX_ComplianceCheckEntries_ComplianceCheckItemId",
                table: "ComplianceCheckEntries",
                column: "ComplianceCheckItemId");

            migrationBuilder.CreateIndex(
                name: "IX_ComplianceCheckEntries_ShopId_Frequency_PeriodDate",
                table: "ComplianceCheckEntries",
                columns: new[] { "ShopId", "Frequency", "PeriodDate" });

            migrationBuilder.CreateIndex(
                name: "IX_ComplianceCheckEntries_ShopId_Frequency_PeriodDate_ComplianceCheckItemId",
                table: "ComplianceCheckEntries",
                columns: new[] { "ShopId", "Frequency", "PeriodDate", "ComplianceCheckItemId" },
                unique: true);

            migrationBuilder.Sql("""
                INSERT INTO [ComplianceCheckEntries]
                (
                    [Id], [ShopId], [CompanyId], [ComplianceCheckItemId], [Frequency], [PeriodDate], [Result], [Notes],
                    [ActionRequired], [CheckedByUserId], [CheckedByName], [CheckedOn], [IsActionClosedOut], [ClosedOutNotes],
                    [ClosedOutByUserId], [ClosedOutByName], [ClosedOutOn], [CreatedOn], [CreatedBy], [ModifiedOn], [ModifiedBy]
                )
                SELECT
                    [Id], [ShopId], [CompanyId], [ComplianceCheckItemId], [Frequency], [CheckDate], [Result], [Notes],
                    [ActionRequired], [CheckedByUserId], [CheckedByName], [CheckedOn], [IsActionClosedOut], [ClosedOutNotes],
                    [ClosedOutByUserId], [ClosedOutByName], [ClosedOutOn], [CreatedOn], [CreatedBy], [ModifiedOn], [ModifiedBy]
                FROM [DailyComplianceCheckEntries];

                INSERT INTO [ComplianceCheckEntries]
                (
                    [Id], [ShopId], [CompanyId], [ComplianceCheckItemId], [Frequency], [PeriodDate], [Result], [Notes],
                    [ActionRequired], [CheckedByUserId], [CheckedByName], [CheckedOn], [IsActionClosedOut], [ClosedOutNotes],
                    [ClosedOutByUserId], [ClosedOutByName], [ClosedOutOn], [CreatedOn], [CreatedBy], [ModifiedOn], [ModifiedBy]
                )
                SELECT
                    [Id], [ShopId], [CompanyId], [ComplianceCheckItemId], [Frequency], [WeekStartDate], [Result], [Notes],
                    [ActionRequired], [CheckedByUserId], [CheckedByName], [CheckedOn], [IsActionClosedOut], [ClosedOutNotes],
                    [ClosedOutByUserId], [ClosedOutByName], [ClosedOutOn], [CreatedOn], [CreatedBy], [ModifiedOn], [ModifiedBy]
                FROM [WeeklyComplianceCheckEntries];

                INSERT INTO [ComplianceCheckEntries]
                (
                    [Id], [ShopId], [CompanyId], [ComplianceCheckItemId], [Frequency], [PeriodDate], [Result], [Notes],
                    [ActionRequired], [CheckedByUserId], [CheckedByName], [CheckedOn], [IsActionClosedOut], [ClosedOutNotes],
                    [ClosedOutByUserId], [ClosedOutByName], [ClosedOutOn], [CreatedOn], [CreatedBy], [ModifiedOn], [ModifiedBy]
                )
                SELECT
                    [Id], [ShopId], [CompanyId], [ComplianceCheckItemId], [Frequency], [MonthStartDate], [Result], [Notes],
                    [ActionRequired], [CheckedByUserId], [CheckedByName], [CheckedOn], [IsActionClosedOut], [ClosedOutNotes],
                    [ClosedOutByUserId], [ClosedOutByName], [ClosedOutOn], [CreatedOn], [CreatedBy], [ModifiedOn], [ModifiedBy]
                FROM [MonthlyComplianceCheckEntries];
                """);

            migrationBuilder.DropTable(
                name: "DailyComplianceCheckEntries");

            migrationBuilder.DropTable(
                name: "MonthlyComplianceCheckEntries");

            migrationBuilder.DropTable(
                name: "WeeklyComplianceCheckEntries");
        }
    }
}
