using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ScratchCard.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddLeaveManagement : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "LeaveRequests",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    RotaStaffMemberId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Type = table.Column<int>(type: "int", nullable: false),
                    StartDate = table.Column<DateOnly>(type: "date", nullable: false),
                    EndDate = table.Column<DateOnly>(type: "date", nullable: false),
                    HoursPerDay = table.Column<decimal>(type: "decimal(5,2)", precision: 5, scale: 2, nullable: false),
                    IsPaid = table.Column<bool>(type: "bit", nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    StaffNote = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    ManagerNote = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    DecidedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    DecidedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LeaveRequests", x => x.Id);
                    table.ForeignKey(
                        name: "FK_LeaveRequests_RotaStaffMembers_RotaStaffMemberId",
                        column: x => x.RotaStaffMemberId,
                        principalTable: "RotaStaffMembers",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_LeaveRequests_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_LeaveRequests_Users_DecidedByUserId",
                        column: x => x.DecidedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_LeaveRequests_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "StaffLeaveEntitlements",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    RotaStaffMemberId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    YearStart = table.Column<DateOnly>(type: "date", nullable: false),
                    EntitledHours = table.Column<decimal>(type: "decimal(9,2)", precision: 9, scale: 2, nullable: false),
                    UsualHoursPerDay = table.Column<decimal>(type: "decimal(5,2)", precision: 5, scale: 2, nullable: false),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StaffLeaveEntitlements", x => x.Id);
                    table.ForeignKey(
                        name: "FK_StaffLeaveEntitlements_RotaStaffMembers_RotaStaffMemberId",
                        column: x => x.RotaStaffMemberId,
                        principalTable: "RotaStaffMembers",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_StaffLeaveEntitlements_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_StaffLeaveEntitlements_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_LeaveRequests_DecidedByUserId",
                table: "LeaveRequests",
                column: "DecidedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_LeaveRequests_RotaStaffMemberId",
                table: "LeaveRequests",
                column: "RotaStaffMemberId");

            migrationBuilder.CreateIndex(
                name: "IX_LeaveRequests_ShopId_StartDate",
                table: "LeaveRequests",
                columns: new[] { "ShopId", "StartDate" });

            migrationBuilder.CreateIndex(
                name: "IX_LeaveRequests_ShopId_UserId_Status",
                table: "LeaveRequests",
                columns: new[] { "ShopId", "UserId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_LeaveRequests_UserId",
                table: "LeaveRequests",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_StaffLeaveEntitlements_RotaStaffMemberId",
                table: "StaffLeaveEntitlements",
                column: "RotaStaffMemberId");

            migrationBuilder.CreateIndex(
                name: "IX_StaffLeaveEntitlements_ShopId_UserId_RotaStaffMemberId_YearStart",
                table: "StaffLeaveEntitlements",
                columns: new[] { "ShopId", "UserId", "RotaStaffMemberId", "YearStart" },
                unique: true,
                filter: "[UserId] IS NOT NULL AND [RotaStaffMemberId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_StaffLeaveEntitlements_UserId",
                table: "StaffLeaveEntitlements",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "LeaveRequests");

            migrationBuilder.DropTable(
                name: "StaffLeaveEntitlements");
        }
    }
}
