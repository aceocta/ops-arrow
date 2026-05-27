using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ScratchCard.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class StripeDirectAndCompanyCustomer : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_SubscriptionPlans_RevenueCatProductId",
                table: "SubscriptionPlans");

            migrationBuilder.DropColumn(
                name: "RevenueCatProductId",
                table: "SubscriptionPlans");

            migrationBuilder.AddColumn<string>(
                name: "StripeCustomerId",
                table: "Companies",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Companies_StripeCustomerId",
                table: "Companies",
                column: "StripeCustomerId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Companies_StripeCustomerId",
                table: "Companies");

            migrationBuilder.DropColumn(
                name: "StripeCustomerId",
                table: "Companies");

            migrationBuilder.AddColumn<string>(
                name: "RevenueCatProductId",
                table: "SubscriptionPlans",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_SubscriptionPlans_RevenueCatProductId",
                table: "SubscriptionPlans",
                column: "RevenueCatProductId");
        }
    }
}
