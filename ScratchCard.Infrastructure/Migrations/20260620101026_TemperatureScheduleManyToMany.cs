using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ScratchCard.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class TemperatureScheduleManyToMany : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // 1. Create the join table FIRST so existing per-unit schedules can be backfilled into it
            //    before the old single-unit column is dropped.
            migrationBuilder.CreateTable(
                name: "TemperatureScheduleUnits",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ScheduleId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TemperatureMonitoringUnitId = table.Column<Guid>(type: "uniqueidentifier", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TemperatureScheduleUnits", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TemperatureScheduleUnits_CfgTemperatureSchedules_ScheduleId",
                        column: x => x.ScheduleId,
                        principalTable: "CfgTemperatureSchedules",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_TemperatureScheduleUnits_TemperatureMonitoringUnits_TemperatureMonitoringUnitId",
                        column: x => x.TemperatureMonitoringUnitId,
                        principalTable: "TemperatureMonitoringUnits",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_TemperatureScheduleUnits_ScheduleId_TemperatureMonitoringUnitId",
                table: "TemperatureScheduleUnits",
                columns: new[] { "ScheduleId", "TemperatureMonitoringUnitId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TemperatureScheduleUnits_TemperatureMonitoringUnitId",
                table: "TemperatureScheduleUnits",
                column: "TemperatureMonitoringUnitId");

            // 2. Backfill: every schedule that targeted a specific unit becomes one link row.
            //    A NULL (shop-wide / all-units) schedule gets no link rows, preserving its meaning.
            migrationBuilder.Sql(@"
                INSERT INTO TemperatureScheduleUnits (Id, ScheduleId, TemperatureMonitoringUnitId)
                SELECT NEWID(), Id, TemperatureMonitoringUnitId
                FROM CfgTemperatureSchedules
                WHERE TemperatureMonitoringUnitId IS NOT NULL;");

            // 3. Now drop the old single-unit column, its FK and index.
            migrationBuilder.DropForeignKey(
                name: "FK_CfgTemperatureSchedules_TemperatureMonitoringUnits_TemperatureMonitoringUnitId",
                table: "CfgTemperatureSchedules");

            migrationBuilder.DropIndex(
                name: "IX_CfgTemperatureSchedules_TemperatureMonitoringUnitId",
                table: "CfgTemperatureSchedules");

            migrationBuilder.DropColumn(
                name: "TemperatureMonitoringUnitId",
                table: "CfgTemperatureSchedules");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Restore the single-unit column.
            migrationBuilder.AddColumn<Guid>(
                name: "TemperatureMonitoringUnitId",
                table: "CfgTemperatureSchedules",
                type: "uniqueidentifier",
                nullable: true);

            // Reverse backfill: collapse each schedule's links back to one unit. Lossy where a
            // schedule covered more than one unit (the old shape can't represent a set).
            migrationBuilder.Sql(@"
                UPDATE s SET TemperatureMonitoringUnitId =
                    (SELECT TOP 1 j.TemperatureMonitoringUnitId
                     FROM TemperatureScheduleUnits j WHERE j.ScheduleId = s.Id)
                FROM CfgTemperatureSchedules s
                WHERE EXISTS (SELECT 1 FROM TemperatureScheduleUnits j WHERE j.ScheduleId = s.Id);");

            migrationBuilder.CreateIndex(
                name: "IX_CfgTemperatureSchedules_TemperatureMonitoringUnitId",
                table: "CfgTemperatureSchedules",
                column: "TemperatureMonitoringUnitId");

            migrationBuilder.AddForeignKey(
                name: "FK_CfgTemperatureSchedules_TemperatureMonitoringUnits_TemperatureMonitoringUnitId",
                table: "CfgTemperatureSchedules",
                column: "TemperatureMonitoringUnitId",
                principalTable: "TemperatureMonitoringUnits",
                principalColumn: "Id");

            migrationBuilder.DropTable(
                name: "TemperatureScheduleUnits");
        }
    }
}
