using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ScratchCard.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ShopSubscriptionPauseResume : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "PauseCapWarningSentOn",
                table: "ShopSubscriptions",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "PausedOn",
                table: "ShopSubscriptions",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ResumedOn",
                table: "ShopSubscriptions",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_ShopSubscriptions_Status_PausedOn",
                table: "ShopSubscriptions",
                columns: new[] { "Status", "PausedOn" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_ShopSubscriptions_Status_PausedOn",
                table: "ShopSubscriptions");

            migrationBuilder.DropColumn(
                name: "PauseCapWarningSentOn",
                table: "ShopSubscriptions");

            migrationBuilder.DropColumn(
                name: "PausedOn",
                table: "ShopSubscriptions");

            migrationBuilder.DropColumn(
                name: "ResumedOn",
                table: "ShopSubscriptions");
        }
    }
}
