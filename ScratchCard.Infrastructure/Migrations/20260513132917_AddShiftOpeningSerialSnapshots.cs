using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ScratchCard.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddShiftOpeningSerialSnapshots : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ShiftOpeningSerials",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShiftId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    BusinessDayId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PackId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ExpectedOpeningSerialNumber = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                    ActualOpeningSerialNumber = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                    MissingQuantity = table.Column<int>(type: "int", nullable: false),
                    OverageQuantity = table.Column<int>(type: "int", nullable: false),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ShiftOpeningSerials", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ShiftOpeningSerials_BusinessDays_BusinessDayId",
                        column: x => x.BusinessDayId,
                        principalTable: "BusinessDays",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_ShiftOpeningSerials_ScratchCardPacks_PackId",
                        column: x => x.PackId,
                        principalTable: "ScratchCardPacks",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_ShiftOpeningSerials_Shifts_ShiftId",
                        column: x => x.ShiftId,
                        principalTable: "Shifts",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_ShiftOpeningSerials_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_ShiftOpeningSerials_BusinessDayId_ShopId",
                table: "ShiftOpeningSerials",
                columns: new[] { "BusinessDayId", "ShopId" });

            migrationBuilder.CreateIndex(
                name: "IX_ShiftOpeningSerials_PackId",
                table: "ShiftOpeningSerials",
                column: "PackId");

            migrationBuilder.CreateIndex(
                name: "IX_ShiftOpeningSerials_ShiftId_PackId",
                table: "ShiftOpeningSerials",
                columns: new[] { "ShiftId", "PackId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ShiftOpeningSerials_ShopId",
                table: "ShiftOpeningSerials",
                column: "ShopId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ShiftOpeningSerials");
        }
    }
}
