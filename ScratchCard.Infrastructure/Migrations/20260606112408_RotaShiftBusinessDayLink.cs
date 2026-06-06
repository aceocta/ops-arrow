using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ScratchCard.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class RotaShiftBusinessDayLink : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "BusinessDayId",
                table: "RotaShifts",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_RotaShifts_BusinessDayId",
                table: "RotaShifts",
                column: "BusinessDayId");

            migrationBuilder.AddForeignKey(
                name: "FK_RotaShifts_BusinessDays_BusinessDayId",
                table: "RotaShifts",
                column: "BusinessDayId",
                principalTable: "BusinessDays",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_RotaShifts_BusinessDays_BusinessDayId",
                table: "RotaShifts");

            migrationBuilder.DropIndex(
                name: "IX_RotaShifts_BusinessDayId",
                table: "RotaShifts");

            migrationBuilder.DropColumn(
                name: "BusinessDayId",
                table: "RotaShifts");
        }
    }
}
