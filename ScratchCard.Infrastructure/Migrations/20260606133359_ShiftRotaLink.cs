using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ScratchCard.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ShiftRotaLink : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "RotaShiftId",
                table: "Shifts",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Shifts_RotaShiftId",
                table: "Shifts",
                column: "RotaShiftId");

            migrationBuilder.AddForeignKey(
                name: "FK_Shifts_RotaShifts_RotaShiftId",
                table: "Shifts",
                column: "RotaShiftId",
                principalTable: "RotaShifts",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Shifts_RotaShifts_RotaShiftId",
                table: "Shifts");

            migrationBuilder.DropIndex(
                name: "IX_Shifts_RotaShiftId",
                table: "Shifts");

            migrationBuilder.DropColumn(
                name: "RotaShiftId",
                table: "Shifts");
        }
    }
}
