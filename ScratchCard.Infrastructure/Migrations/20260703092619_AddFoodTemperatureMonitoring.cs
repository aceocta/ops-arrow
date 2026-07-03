using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ScratchCard.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddFoodTemperatureMonitoring : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CorrectiveActions",
                table: "TemperatureReadings",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);

            // Default Pass(1); existing rows are backfilled from IsOutOfRange below.
            migrationBuilder.AddColumn<int>(
                name: "Result",
                table: "TemperatureReadings",
                type: "int",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.AddColumn<Guid>(
                name: "TemperatureEquipmentIssueId",
                table: "TemperatureReadings",
                type: "uniqueidentifier",
                nullable: true);

            // Default Working(1); existing rows are backfilled from IsActive below.
            migrationBuilder.AddColumn<int>(
                name: "CurrentWorkingStatus",
                table: "TemperatureMonitoringUnits",
                type: "int",
                nullable: false,
                defaultValue: 1);

            // Default ColdFood(2); existing rows are backfilled from EquipmentType below.
            migrationBuilder.AddColumn<int>(
                name: "FoodCategory",
                table: "TemperatureMonitoringUnits",
                type: "int",
                nullable: false,
                defaultValue: 2);

            // ── Non-destructive backfill of existing rows ────────────────────────────────────────
            // FoodCategory from the appliance type: HotFoodDisplay(5)->HotFood(1), Freezer(2)->Frozen(3),
            // everything else -> ColdFood(2). (TemperatureEquipmentType: Fridge=1,Freezer=2,CoolRoom=3,
            // DisplayChill=4,HotFoodDisplay=5,Other=99.)
            migrationBuilder.Sql(@"
UPDATE [TemperatureMonitoringUnits]
SET [FoodCategory] = CASE
    WHEN [EquipmentType] = 5 THEN 1
    WHEN [EquipmentType] = 2 THEN 3
    ELSE 2
END;");

            // Working status from IsActive: active -> Working(1), inactive -> Inactive(6).
            migrationBuilder.Sql(@"
UPDATE [TemperatureMonitoringUnits]
SET [CurrentWorkingStatus] = CASE WHEN [IsActive] = 1 THEN 1 ELSE 6 END;");

            // Verdict from the legacy binary flag: out-of-range -> Fail(3), else Pass(1). No historical
            // Warning tier, so past out-of-range readings map to Fail.
            migrationBuilder.Sql(@"
UPDATE [TemperatureReadings]
SET [Result] = CASE WHEN [IsOutOfRange] = 1 THEN 3 ELSE 1 END;");

            migrationBuilder.CreateTable(
                name: "TemperatureEquipmentIssues",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TemperatureMonitoringUnitId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    Reason = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    TemperatureAtOpenCelsius = table.Column<decimal>(type: "decimal(5,2)", precision: 5, scale: 2, nullable: true),
                    OpenedFromReading = table.Column<bool>(type: "bit", nullable: false),
                    IssueStartedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    OpenedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    OpenedByName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    FoodAffected = table.Column<bool>(type: "bit", nullable: true),
                    FoodMoved = table.Column<bool>(type: "bit", nullable: true),
                    FoodMovedTo = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    FoodDiscarded = table.Column<bool>(type: "bit", nullable: true),
                    ManagerInformed = table.Column<bool>(type: "bit", nullable: true),
                    CorrectiveActions = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    MaintenanceStartedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    MaintenanceByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ResolvedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ResolvedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ResolvedByName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    FinalTemperatureCelsius = table.Column<decimal>(type: "decimal(5,2)", precision: 5, scale: 2, nullable: true),
                    ResolutionNotes = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    ResolvedWithWarning = table.Column<bool>(type: "bit", nullable: false),
                    ApprovedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ApprovedByName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    ApprovedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ApprovalSignatureImagePath = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    Notes = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TemperatureEquipmentIssues", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TemperatureEquipmentIssues_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_TemperatureEquipmentIssues_TemperatureMonitoringUnits_TemperatureMonitoringUnitId",
                        column: x => x.TemperatureMonitoringUnitId,
                        principalTable: "TemperatureMonitoringUnits",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "TemperatureAttachments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TemperatureReadingId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    TemperatureEquipmentIssueId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
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
                    table.PrimaryKey("PK_TemperatureAttachments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TemperatureAttachments_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_TemperatureAttachments_TemperatureEquipmentIssues_TemperatureEquipmentIssueId",
                        column: x => x.TemperatureEquipmentIssueId,
                        principalTable: "TemperatureEquipmentIssues",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_TemperatureAttachments_TemperatureReadings_TemperatureReadingId",
                        column: x => x.TemperatureReadingId,
                        principalTable: "TemperatureReadings",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_TemperatureReadings_TemperatureEquipmentIssueId",
                table: "TemperatureReadings",
                column: "TemperatureEquipmentIssueId");

            migrationBuilder.CreateIndex(
                name: "IX_TemperatureAttachments_ShopId",
                table: "TemperatureAttachments",
                column: "ShopId");

            migrationBuilder.CreateIndex(
                name: "IX_TemperatureAttachments_TemperatureEquipmentIssueId",
                table: "TemperatureAttachments",
                column: "TemperatureEquipmentIssueId");

            migrationBuilder.CreateIndex(
                name: "IX_TemperatureAttachments_TemperatureReadingId",
                table: "TemperatureAttachments",
                column: "TemperatureReadingId");

            migrationBuilder.CreateIndex(
                name: "IX_TemperatureEquipmentIssues_ShopId_TemperatureMonitoringUnitId_Status",
                table: "TemperatureEquipmentIssues",
                columns: new[] { "ShopId", "TemperatureMonitoringUnitId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_TemperatureEquipmentIssues_TemperatureMonitoringUnitId",
                table: "TemperatureEquipmentIssues",
                column: "TemperatureMonitoringUnitId");

            migrationBuilder.AddForeignKey(
                name: "FK_TemperatureReadings_TemperatureEquipmentIssues_TemperatureEquipmentIssueId",
                table: "TemperatureReadings",
                column: "TemperatureEquipmentIssueId",
                principalTable: "TemperatureEquipmentIssues",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_TemperatureReadings_TemperatureEquipmentIssues_TemperatureEquipmentIssueId",
                table: "TemperatureReadings");

            migrationBuilder.DropTable(
                name: "TemperatureAttachments");

            migrationBuilder.DropTable(
                name: "TemperatureEquipmentIssues");

            migrationBuilder.DropIndex(
                name: "IX_TemperatureReadings_TemperatureEquipmentIssueId",
                table: "TemperatureReadings");

            migrationBuilder.DropColumn(
                name: "CorrectiveActions",
                table: "TemperatureReadings");

            migrationBuilder.DropColumn(
                name: "Result",
                table: "TemperatureReadings");

            migrationBuilder.DropColumn(
                name: "TemperatureEquipmentIssueId",
                table: "TemperatureReadings");

            migrationBuilder.DropColumn(
                name: "CurrentWorkingStatus",
                table: "TemperatureMonitoringUnits");

            migrationBuilder.DropColumn(
                name: "FoodCategory",
                table: "TemperatureMonitoringUnits");
        }
    }
}
