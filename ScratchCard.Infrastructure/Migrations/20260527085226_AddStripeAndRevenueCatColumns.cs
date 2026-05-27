using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ScratchCard.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddStripeAndRevenueCatColumns : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "DisplayOrder",
                table: "SubscriptionPlans",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "RevenueCatProductId",
                table: "SubscriptionPlans",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "StripePriceId",
                table: "SubscriptionPlans",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "StripeCustomerId",
                table: "ShopSubscriptions",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "StripeSubscriptionId",
                table: "ShopSubscriptions",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_SubscriptionPlans_RevenueCatProductId",
                table: "SubscriptionPlans",
                column: "RevenueCatProductId");

            migrationBuilder.CreateIndex(
                name: "IX_SubscriptionPlans_StripePriceId",
                table: "SubscriptionPlans",
                column: "StripePriceId");

            migrationBuilder.CreateIndex(
                name: "IX_ShopSubscriptions_StripeCustomerId",
                table: "ShopSubscriptions",
                column: "StripeCustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_ShopSubscriptions_StripeSubscriptionId",
                table: "ShopSubscriptions",
                column: "StripeSubscriptionId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_SubscriptionPlans_RevenueCatProductId",
                table: "SubscriptionPlans");

            migrationBuilder.DropIndex(
                name: "IX_SubscriptionPlans_StripePriceId",
                table: "SubscriptionPlans");

            migrationBuilder.DropIndex(
                name: "IX_ShopSubscriptions_StripeCustomerId",
                table: "ShopSubscriptions");

            migrationBuilder.DropIndex(
                name: "IX_ShopSubscriptions_StripeSubscriptionId",
                table: "ShopSubscriptions");

            migrationBuilder.DropColumn(
                name: "DisplayOrder",
                table: "SubscriptionPlans");

            migrationBuilder.DropColumn(
                name: "RevenueCatProductId",
                table: "SubscriptionPlans");

            migrationBuilder.DropColumn(
                name: "StripePriceId",
                table: "SubscriptionPlans");

            migrationBuilder.DropColumn(
                name: "StripeCustomerId",
                table: "ShopSubscriptions");

            migrationBuilder.DropColumn(
                name: "StripeSubscriptionId",
                table: "ShopSubscriptions");
        }
    }
}
