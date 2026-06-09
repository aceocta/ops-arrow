using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ScratchCard.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class TillReconciliationPhase1 : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "TillReconciliations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TillId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ReportType = table.Column<int>(type: "int", nullable: false),
                    ShiftId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    BusinessDayId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    BusinessDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    OpeningFloat = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    CountedCash = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: true),
                    DenominationJson = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    FloatToCarry = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: true),
                    CardCounted = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: true),
                    ExpectedCash = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    CashVariance = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    VarianceReasonCode = table.Column<string>(type: "nvarchar(60)", maxLength: 60, nullable: true),
                    VarianceNotes = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    ConfirmedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ConfirmedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    IsDeleted = table.Column<bool>(type: "bit", nullable: false, defaultValue: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TillReconciliations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TillReconciliations_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_TillReconciliations_Tills_TillId",
                        column: x => x.TillId,
                        principalTable: "Tills",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "TillReconciliationAttachments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TillReconciliationId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StoragePath = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    SourceLabel = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: true),
                    OcrRawText = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TillReconciliationAttachments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TillReconciliationAttachments_TillReconciliations_TillReconciliationId",
                        column: x => x.TillReconciliationId,
                        principalTable: "TillReconciliations",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "TillReconciliationLines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TillReconciliationId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CanonicalField = table.Column<int>(type: "int", nullable: false),
                    Section = table.Column<string>(type: "nvarchar(60)", maxLength: 60, nullable: true),
                    RawLabel = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    ExtractedAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: true),
                    VerifiedAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Quantity = table.Column<int>(type: "int", nullable: true),
                    CaptureMethod = table.Column<int>(type: "int", nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    Notes = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TillReconciliationLines", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TillReconciliationLines_TillReconciliations_TillReconciliationId",
                        column: x => x.TillReconciliationId,
                        principalTable: "TillReconciliations",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_TillReconciliationAttachments_TillReconciliationId",
                table: "TillReconciliationAttachments",
                column: "TillReconciliationId");

            migrationBuilder.CreateIndex(
                name: "IX_TillReconciliationLines_TillReconciliationId",
                table: "TillReconciliationLines",
                column: "TillReconciliationId");

            migrationBuilder.CreateIndex(
                name: "IX_TillReconciliations_ShopId_BusinessDate",
                table: "TillReconciliations",
                columns: new[] { "ShopId", "BusinessDate" });

            migrationBuilder.CreateIndex(
                name: "IX_TillReconciliations_TillId",
                table: "TillReconciliations",
                column: "TillId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TillReconciliationAttachments");

            migrationBuilder.DropTable(
                name: "TillReconciliationLines");

            migrationBuilder.DropTable(
                name: "TillReconciliations");
        }
    }
}
