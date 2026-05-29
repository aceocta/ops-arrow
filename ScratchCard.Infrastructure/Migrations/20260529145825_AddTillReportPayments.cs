using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ScratchCard.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddTillReportPayments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "TillReportPayments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TillReportId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PaymentType = table.Column<int>(type: "int", nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Source = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TillReportPayments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TillReportPayments_TillReports_TillReportId",
                        column: x => x.TillReportId,
                        principalTable: "TillReports",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_TillReportPayments_TillReportId_PaymentType",
                table: "TillReportPayments",
                columns: new[] { "TillReportId", "PaymentType" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TillReportPayments");
        }
    }
}
