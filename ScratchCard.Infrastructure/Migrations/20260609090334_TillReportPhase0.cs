using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ScratchCard.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class TillReportPhase0 : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ShopServiceCounterConfigs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CounterType = table.Column<int>(type: "int", nullable: false),
                    IsEnabled = table.Column<bool>(type: "bit", nullable: false, defaultValue: true),
                    Variant = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: true),
                    CashDirection = table.Column<int>(type: "int", nullable: false),
                    AffectsRetailDrawer = table.Column<bool>(type: "bit", nullable: false),
                    Settlement = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    CommissionRate = table.Column<decimal>(type: "decimal(9,4)", precision: 9, scale: 4, nullable: true),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    IsDeleted = table.Column<bool>(type: "bit", nullable: false, defaultValue: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ShopServiceCounterConfigs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ShopServiceCounterConfigs_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "TillLabelMappings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Scope = table.Column<int>(type: "int", nullable: false),
                    ScopeId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    NormalizedLabel = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    RawSample = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    Section = table.Column<string>(type: "nvarchar(60)", maxLength: 60, nullable: true),
                    CanonicalField = table.Column<int>(type: "int", nullable: false),
                    Source = table.Column<int>(type: "int", nullable: false),
                    Confidence = table.Column<double>(type: "float", nullable: false),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TillLabelMappings", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ShopServiceCounterConfigs_ShopId_CounterType",
                table: "ShopServiceCounterConfigs",
                columns: new[] { "ShopId", "CounterType" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TillLabelMappings_Scope_ScopeId_NormalizedLabel",
                table: "TillLabelMappings",
                columns: new[] { "Scope", "ScopeId", "NormalizedLabel" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ShopServiceCounterConfigs");

            migrationBuilder.DropTable(
                name: "TillLabelMappings");
        }
    }
}
