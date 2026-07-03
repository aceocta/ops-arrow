using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ScratchCard.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddShiftAttendanceSubmittedTimes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "SubmittedCheckInAt",
                table: "ShiftAttendances",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "SubmittedCheckOutAt",
                table: "ShiftAttendances",
                type: "datetimeoffset",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "SubmittedCheckInAt",
                table: "ShiftAttendances");

            migrationBuilder.DropColumn(
                name: "SubmittedCheckOutAt",
                table: "ShiftAttendances");
        }
    }
}
