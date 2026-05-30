using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ScratchCard.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class UniqueShopNamePerCompany : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Shops_CompanyId_ShopName",
                table: "Shops");

            migrationBuilder.CreateIndex(
                name: "IX_Shops_CompanyId_ShopName",
                table: "Shops",
                columns: new[] { "CompanyId", "ShopName" },
                unique: true,
                filter: "[IsDeleted] = 0 AND [CompanyId] IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Shops_CompanyId_ShopName",
                table: "Shops");

            migrationBuilder.CreateIndex(
                name: "IX_Shops_CompanyId_ShopName",
                table: "Shops",
                columns: new[] { "CompanyId", "ShopName" });
        }
    }
}
