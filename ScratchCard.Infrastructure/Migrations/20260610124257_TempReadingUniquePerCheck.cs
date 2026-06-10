using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ScratchCard.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class TempReadingUniquePerCheck : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_TemperatureReadings_TemperatureMonitoringUnitId_ReadingDate_ReadingTime",
                table: "TemperatureReadings");

            migrationBuilder.CreateIndex(
                name: "IX_TemperatureReadings_TemperatureMonitoringUnitId_ReadingDate_ScheduleId_ReadingTime",
                table: "TemperatureReadings",
                columns: new[] { "TemperatureMonitoringUnitId", "ReadingDate", "ScheduleId", "ReadingTime" },
                unique: true,
                filter: "[ScheduleId] IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_TemperatureReadings_TemperatureMonitoringUnitId_ReadingDate_ScheduleId_ReadingTime",
                table: "TemperatureReadings");

            migrationBuilder.CreateIndex(
                name: "IX_TemperatureReadings_TemperatureMonitoringUnitId_ReadingDate_ReadingTime",
                table: "TemperatureReadings",
                columns: new[] { "TemperatureMonitoringUnitId", "ReadingDate", "ReadingTime" },
                unique: true);
        }
    }
}
