using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ScratchCard.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class StaffPayRate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "StaffPayRates",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    RotaStaffMemberId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    HourlyRate = table.Column<decimal>(type: "decimal(9,2)", precision: 9, scale: 2, nullable: false),
                    EffectiveFrom = table.Column<DateOnly>(type: "date", nullable: false),
                    Notes = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: true),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    IsDeleted = table.Column<bool>(type: "bit", nullable: false, defaultValue: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StaffPayRates", x => x.Id);
                    table.ForeignKey(
                        name: "FK_StaffPayRates_RotaStaffMembers_RotaStaffMemberId",
                        column: x => x.RotaStaffMemberId,
                        principalTable: "RotaStaffMembers",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_StaffPayRates_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_StaffPayRates_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_StaffPayRates_RotaStaffMemberId",
                table: "StaffPayRates",
                column: "RotaStaffMemberId");

            migrationBuilder.CreateIndex(
                name: "IX_StaffPayRates_ShopId_UserId_RotaStaffMemberId_EffectiveFrom",
                table: "StaffPayRates",
                columns: new[] { "ShopId", "UserId", "RotaStaffMemberId", "EffectiveFrom" });

            migrationBuilder.CreateIndex(
                name: "IX_StaffPayRates_UserId",
                table: "StaffPayRates",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "StaffPayRates");
        }
    }
}
