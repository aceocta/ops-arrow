using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ScratchCard.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddSafeDropManagement : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "EnableSafeDropManagement",
                table: "CfgDayCloseSettings",
                type: "bit",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "IncludedFeatures",
                table: "SubscriptionPlans",
                type: "nvarchar(2000)",
                maxLength: 2000,
                nullable: true);

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
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CanisterDrops");

            migrationBuilder.DropTable(
                name: "Canisters");

            migrationBuilder.DropColumn(
                name: "EnableSafeDropManagement",
                table: "CfgDayCloseSettings");

            migrationBuilder.DropColumn(
                name: "IncludedFeatures",
                table: "SubscriptionPlans");
        }
    }
}
