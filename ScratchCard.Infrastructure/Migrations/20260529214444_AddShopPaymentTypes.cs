using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ScratchCard.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddShopPaymentTypes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_TillReportPayments_TillReportId_PaymentType",
                table: "TillReportPayments");

            migrationBuilder.DropColumn(
                name: "PaymentType",
                table: "TillReportPayments");

            migrationBuilder.AddColumn<Guid>(
                name: "PaymentTypeId",
                table: "TillReportPayments",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PaymentTypeName",
                table: "TillReportPayments",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateTable(
                name: "ShopPaymentTypes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Code = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: true),
                    Keywords = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    SortOrder = table.Column<int>(type: "int", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false, defaultValue: true),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    IsDeleted = table.Column<bool>(type: "bit", nullable: false, defaultValue: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ShopPaymentTypes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ShopPaymentTypes_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_TillReportPayments_PaymentTypeId",
                table: "TillReportPayments",
                column: "PaymentTypeId");

            migrationBuilder.CreateIndex(
                name: "IX_TillReportPayments_TillReportId_PaymentTypeId",
                table: "TillReportPayments",
                columns: new[] { "TillReportId", "PaymentTypeId" },
                unique: true,
                filter: "[PaymentTypeId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_ShopPaymentTypes_ShopId_IsActive",
                table: "ShopPaymentTypes",
                columns: new[] { "ShopId", "IsActive" });

            migrationBuilder.CreateIndex(
                name: "IX_ShopPaymentTypes_ShopId_Name",
                table: "ShopPaymentTypes",
                columns: new[] { "ShopId", "Name" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_TillReportPayments_ShopPaymentTypes_PaymentTypeId",
                table: "TillReportPayments",
                column: "PaymentTypeId",
                principalTable: "ShopPaymentTypes",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_TillReportPayments_ShopPaymentTypes_PaymentTypeId",
                table: "TillReportPayments");

            migrationBuilder.DropTable(
                name: "ShopPaymentTypes");

            migrationBuilder.DropIndex(
                name: "IX_TillReportPayments_PaymentTypeId",
                table: "TillReportPayments");

            migrationBuilder.DropIndex(
                name: "IX_TillReportPayments_TillReportId_PaymentTypeId",
                table: "TillReportPayments");

            migrationBuilder.DropColumn(
                name: "PaymentTypeId",
                table: "TillReportPayments");

            migrationBuilder.DropColumn(
                name: "PaymentTypeName",
                table: "TillReportPayments");

            migrationBuilder.AddColumn<int>(
                name: "PaymentType",
                table: "TillReportPayments",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateIndex(
                name: "IX_TillReportPayments_TillReportId_PaymentType",
                table: "TillReportPayments",
                columns: new[] { "TillReportId", "PaymentType" },
                unique: true);
        }
    }
}
