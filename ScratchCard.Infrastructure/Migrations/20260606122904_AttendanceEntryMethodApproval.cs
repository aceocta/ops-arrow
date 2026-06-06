using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ScratchCard.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AttendanceEntryMethodApproval : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "ApprovedByUserId",
                table: "ShiftAttendances",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ApprovedOn",
                table: "ShiftAttendances",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "EntryMethod",
                table: "ShiftAttendances",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<bool>(
                name: "IsApproved",
                table: "ShiftAttendances",
                type: "bit",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ApprovedByUserId",
                table: "ShiftAttendances");

            migrationBuilder.DropColumn(
                name: "ApprovedOn",
                table: "ShiftAttendances");

            migrationBuilder.DropColumn(
                name: "EntryMethod",
                table: "ShiftAttendances");

            migrationBuilder.DropColumn(
                name: "IsApproved",
                table: "ShiftAttendances");
        }
    }
}
