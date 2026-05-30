using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ScratchCard.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class TemperatureScheduleBinding : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsLateForSchedule",
                table: "TemperatureReadings",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<Guid>(
                name: "ScheduleId",
                table: "TemperatureReadings",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_TemperatureReadings_ScheduleId",
                table: "TemperatureReadings",
                column: "ScheduleId");

            migrationBuilder.AddForeignKey(
                name: "FK_TemperatureReadings_CfgTemperatureSchedules_ScheduleId",
                table: "TemperatureReadings",
                column: "ScheduleId",
                principalTable: "CfgTemperatureSchedules",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_TemperatureReadings_CfgTemperatureSchedules_ScheduleId",
                table: "TemperatureReadings");

            migrationBuilder.DropIndex(
                name: "IX_TemperatureReadings_ScheduleId",
                table: "TemperatureReadings");

            migrationBuilder.DropColumn(
                name: "IsLateForSchedule",
                table: "TemperatureReadings");

            migrationBuilder.DropColumn(
                name: "ScheduleId",
                table: "TemperatureReadings");
        }
    }
}
