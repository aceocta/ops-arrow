using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ScratchCard.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class RotaStaffMembers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_ShiftAssignments_RotaShiftId_UserId",
                table: "ShiftAssignments");

            migrationBuilder.AlterColumn<Guid>(
                name: "UserId",
                table: "ShiftAttendances",
                type: "uniqueidentifier",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier");

            migrationBuilder.AddColumn<Guid>(
                name: "RotaStaffMemberId",
                table: "ShiftAttendances",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AlterColumn<Guid>(
                name: "UserId",
                table: "ShiftAssignments",
                type: "uniqueidentifier",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier");

            migrationBuilder.AddColumn<Guid>(
                name: "RotaStaffMemberId",
                table: "ShiftAssignments",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "RotaStaffMembers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    Phone = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: true),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    IsDeleted = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RotaStaffMembers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RotaStaffMembers_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_ShiftAttendances_RotaStaffMemberId",
                table: "ShiftAttendances",
                column: "RotaStaffMemberId");

            migrationBuilder.CreateIndex(
                name: "IX_ShiftAttendances_ShopId_RotaStaffMemberId_CheckInAt",
                table: "ShiftAttendances",
                columns: new[] { "ShopId", "RotaStaffMemberId", "CheckInAt" });

            migrationBuilder.CreateIndex(
                name: "IX_ShiftAssignments_RotaShiftId_RotaStaffMemberId",
                table: "ShiftAssignments",
                columns: new[] { "RotaShiftId", "RotaStaffMemberId" });

            migrationBuilder.CreateIndex(
                name: "IX_ShiftAssignments_RotaShiftId_UserId",
                table: "ShiftAssignments",
                columns: new[] { "RotaShiftId", "UserId" });

            migrationBuilder.CreateIndex(
                name: "IX_ShiftAssignments_RotaStaffMemberId",
                table: "ShiftAssignments",
                column: "RotaStaffMemberId");

            migrationBuilder.CreateIndex(
                name: "IX_RotaStaffMembers_ShopId_IsDeleted",
                table: "RotaStaffMembers",
                columns: new[] { "ShopId", "IsDeleted" });

            migrationBuilder.AddForeignKey(
                name: "FK_ShiftAssignments_RotaStaffMembers_RotaStaffMemberId",
                table: "ShiftAssignments",
                column: "RotaStaffMemberId",
                principalTable: "RotaStaffMembers",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_ShiftAttendances_RotaStaffMembers_RotaStaffMemberId",
                table: "ShiftAttendances",
                column: "RotaStaffMemberId",
                principalTable: "RotaStaffMembers",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ShiftAssignments_RotaStaffMembers_RotaStaffMemberId",
                table: "ShiftAssignments");

            migrationBuilder.DropForeignKey(
                name: "FK_ShiftAttendances_RotaStaffMembers_RotaStaffMemberId",
                table: "ShiftAttendances");

            migrationBuilder.DropTable(
                name: "RotaStaffMembers");

            migrationBuilder.DropIndex(
                name: "IX_ShiftAttendances_RotaStaffMemberId",
                table: "ShiftAttendances");

            migrationBuilder.DropIndex(
                name: "IX_ShiftAttendances_ShopId_RotaStaffMemberId_CheckInAt",
                table: "ShiftAttendances");

            migrationBuilder.DropIndex(
                name: "IX_ShiftAssignments_RotaShiftId_RotaStaffMemberId",
                table: "ShiftAssignments");

            migrationBuilder.DropIndex(
                name: "IX_ShiftAssignments_RotaShiftId_UserId",
                table: "ShiftAssignments");

            migrationBuilder.DropIndex(
                name: "IX_ShiftAssignments_RotaStaffMemberId",
                table: "ShiftAssignments");

            migrationBuilder.DropColumn(
                name: "RotaStaffMemberId",
                table: "ShiftAttendances");

            migrationBuilder.DropColumn(
                name: "RotaStaffMemberId",
                table: "ShiftAssignments");

            migrationBuilder.AlterColumn<Guid>(
                name: "UserId",
                table: "ShiftAttendances",
                type: "uniqueidentifier",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier",
                oldNullable: true);

            migrationBuilder.AlterColumn<Guid>(
                name: "UserId",
                table: "ShiftAssignments",
                type: "uniqueidentifier",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier",
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_ShiftAssignments_RotaShiftId_UserId",
                table: "ShiftAssignments",
                columns: new[] { "RotaShiftId", "UserId" },
                unique: true);
        }
    }
}
