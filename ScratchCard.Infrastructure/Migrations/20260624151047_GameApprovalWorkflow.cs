using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ScratchCard.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class GameApprovalWorkflow : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "ApprovalStatus",
                table: "MasterScratchCardGames",
                type: "int",
                nullable: false,
                defaultValue: 1); // ApprovalStatus.Pending (matches the entity default for new rows)

            migrationBuilder.AddColumn<Guid>(
                name: "ApprovedByUserId",
                table: "MasterScratchCardGames",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ApprovedOn",
                table: "MasterScratchCardGames",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "OriginCompanyId",
                table: "MasterScratchCardGames",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "OriginShopId",
                table: "MasterScratchCardGames",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RejectionReason",
                table: "MasterScratchCardGames",
                type: "nvarchar(max)",
                nullable: true);

            // Backfill: every game that already existed before this workflow is treated as approved
            // (global) so existing assignments keep working and nothing is forced through the queue.
            migrationBuilder.Sql("UPDATE [MasterScratchCardGames] SET [ApprovalStatus] = 2, [ApprovedOn] = SYSDATETIMEOFFSET();");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ApprovalStatus",
                table: "MasterScratchCardGames");

            migrationBuilder.DropColumn(
                name: "ApprovedByUserId",
                table: "MasterScratchCardGames");

            migrationBuilder.DropColumn(
                name: "ApprovedOn",
                table: "MasterScratchCardGames");

            migrationBuilder.DropColumn(
                name: "OriginCompanyId",
                table: "MasterScratchCardGames");

            migrationBuilder.DropColumn(
                name: "OriginShopId",
                table: "MasterScratchCardGames");

            migrationBuilder.DropColumn(
                name: "RejectionReason",
                table: "MasterScratchCardGames");
        }
    }
}
