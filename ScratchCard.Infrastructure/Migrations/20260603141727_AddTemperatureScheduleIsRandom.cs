using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ScratchCard.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddTemperatureScheduleIsRandom : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsRandom",
                table: "CfgTemperatureSchedules",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateIndex(
                name: "IX_CfgTemperatureSchedules_ShopId",
                table: "CfgTemperatureSchedules",
                column: "ShopId",
                unique: true,
                filter: "[IsRandom] = 1");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_CfgTemperatureSchedules_ShopId",
                table: "CfgTemperatureSchedules");

            migrationBuilder.DropColumn(
                name: "IsRandom",
                table: "CfgTemperatureSchedules");
        }
    }
}
