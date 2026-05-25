using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ScratchCard.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddProductIdsAndReportExportLog : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AppleProductId",
                table: "SubscriptionPlans",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "GoogleProductId",
                table: "SubscriptionPlans",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);

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

            migrationBuilder.CreateIndex(
                name: "IX_ReportExportLogs_ShopId_ExportedOn",
                table: "ReportExportLogs",
                columns: new[] { "ShopId", "ExportedOn" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ReportExportLogs");

            migrationBuilder.DropColumn(
                name: "AppleProductId",
                table: "SubscriptionPlans");

            migrationBuilder.DropColumn(
                name: "GoogleProductId",
                table: "SubscriptionPlans");
        }
    }
}
