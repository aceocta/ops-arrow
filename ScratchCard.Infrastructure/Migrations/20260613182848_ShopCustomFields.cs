using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ScratchCard.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ShopCustomFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "GroupCode",
                table: "TillFieldDefinitions",
                type: "nvarchar(60)",
                maxLength: 60,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ShopId",
                table: "TillFieldDefinitions",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_TillFieldDefinitions_ShopId",
                table: "TillFieldDefinitions",
                column: "ShopId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_TillFieldDefinitions_ShopId",
                table: "TillFieldDefinitions");

            migrationBuilder.DropColumn(
                name: "GroupCode",
                table: "TillFieldDefinitions");

            migrationBuilder.DropColumn(
                name: "ShopId",
                table: "TillFieldDefinitions");
        }
    }
}
