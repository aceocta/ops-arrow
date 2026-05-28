using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ScratchCard.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddShiftPackClosing : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ShiftPackClosings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShiftId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PackId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ClosingSerialNumber = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                    OriginalScannedSerialNumber = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: true),
                    EntryMethod = table.Column<int>(type: "int", nullable: false),
                    ManualEntryReason = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    Notes = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    EnteredByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    EnteredOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ShiftPackClosings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ShiftPackClosings_ScratchCardPacks_PackId",
                        column: x => x.PackId,
                        principalTable: "ScratchCardPacks",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_ShiftPackClosings_Shifts_ShiftId",
                        column: x => x.ShiftId,
                        principalTable: "Shifts",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_ShiftPackClosings_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_ShiftPackClosings_PackId",
                table: "ShiftPackClosings",
                column: "PackId");

            migrationBuilder.CreateIndex(
                name: "IX_ShiftPackClosings_ShiftId_PackId",
                table: "ShiftPackClosings",
                columns: new[] { "ShiftId", "PackId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ShiftPackClosings_ShopId",
                table: "ShiftPackClosings",
                column: "ShopId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ShiftPackClosings");
        }
    }
}
