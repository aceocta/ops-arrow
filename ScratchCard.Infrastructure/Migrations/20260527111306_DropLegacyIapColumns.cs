using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ScratchCard.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class DropLegacyIapColumns : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AppleProductId",
                table: "SubscriptionPlans");

            migrationBuilder.DropColumn(
                name: "GoogleProductId",
                table: "SubscriptionPlans");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
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
        }
    }
}
