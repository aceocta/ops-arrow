using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ScratchCard.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddTemperatureResolutionAndAttachmentConstraints : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "EngineerContacted",
                table: "TemperatureEquipmentIssues",
                type: "bit",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "FoodActionCompleted",
                table: "TemperatureEquipmentIssues",
                type: "bit",
                nullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_TemperatureAttachments_OwnerXor",
                table: "TemperatureAttachments",
                sql: "([TemperatureReadingId] IS NOT NULL AND [TemperatureEquipmentIssueId] IS NULL) OR ([TemperatureReadingId] IS NULL AND [TemperatureEquipmentIssueId] IS NOT NULL)");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_TemperatureAttachments_OwnerXor",
                table: "TemperatureAttachments");

            migrationBuilder.DropColumn(
                name: "EngineerContacted",
                table: "TemperatureEquipmentIssues");

            migrationBuilder.DropColumn(
                name: "FoodActionCompleted",
                table: "TemperatureEquipmentIssues");
        }
    }
}
