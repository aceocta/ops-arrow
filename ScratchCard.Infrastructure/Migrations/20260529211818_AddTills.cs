using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ScratchCard.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddTills : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "TillId",
                table: "TillReports",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "Tills",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Code = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: true),
                    IsActive = table.Column<bool>(type: "bit", nullable: false, defaultValue: true),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    IsDeleted = table.Column<bool>(type: "bit", nullable: false, defaultValue: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Tills", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Tills_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_TillReports_TillId",
                table: "TillReports",
                column: "TillId");

            migrationBuilder.CreateIndex(
                name: "IX_Tills_ShopId_IsActive",
                table: "Tills",
                columns: new[] { "ShopId", "IsActive" });

            migrationBuilder.CreateIndex(
                name: "IX_Tills_ShopId_Name",
                table: "Tills",
                columns: new[] { "ShopId", "Name" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_TillReports_Tills_TillId",
                table: "TillReports",
                column: "TillId",
                principalTable: "Tills",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_TillReports_Tills_TillId",
                table: "TillReports");

            migrationBuilder.DropTable(
                name: "Tills");

            migrationBuilder.DropIndex(
                name: "IX_TillReports_TillId",
                table: "TillReports");

            migrationBuilder.DropColumn(
                name: "TillId",
                table: "TillReports");
        }
    }
}
