using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ScratchCard.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class RotaShiftEndDate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateOnly>(
                name: "EndDate",
                table: "RotaShifts",
                type: "date",
                nullable: false,
                defaultValue: new DateOnly(1, 1, 1));

            // Backfill existing rows: overnight (EndTime <= StartTime) ends the next day, else same day.
            migrationBuilder.Sql(
                "UPDATE RotaShifts SET EndDate = CASE WHEN EndTime <= StartTime THEN DATEADD(day, 1, ShiftDate) ELSE ShiftDate END;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "EndDate",
                table: "RotaShifts");
        }
    }
}
