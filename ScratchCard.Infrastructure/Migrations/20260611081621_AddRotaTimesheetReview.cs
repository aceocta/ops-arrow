using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ScratchCard.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddRotaTimesheetReview : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "RotaTimesheetReviews",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PeriodFrom = table.Column<DateOnly>(type: "date", nullable: false),
                    PeriodTo = table.Column<DateOnly>(type: "date", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    StaffNote = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    ManagerNote = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    ConfirmedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ResolvedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ResolvedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RotaTimesheetReviews", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RotaTimesheetReviews_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_RotaTimesheetReviews_Users_ResolvedByUserId",
                        column: x => x.ResolvedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_RotaTimesheetReviews_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_RotaTimesheetReviews_ResolvedByUserId",
                table: "RotaTimesheetReviews",
                column: "ResolvedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_RotaTimesheetReviews_ShopId_PeriodFrom_PeriodTo_UserId",
                table: "RotaTimesheetReviews",
                columns: new[] { "ShopId", "PeriodFrom", "PeriodTo", "UserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_RotaTimesheetReviews_ShopId_UserId_Status",
                table: "RotaTimesheetReviews",
                columns: new[] { "ShopId", "UserId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_RotaTimesheetReviews_UserId",
                table: "RotaTimesheetReviews",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "RotaTimesheetReviews");
        }
    }
}
