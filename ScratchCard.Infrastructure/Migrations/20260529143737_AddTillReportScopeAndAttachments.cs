using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ScratchCard.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddTillReportScopeAndAttachments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AttachmentPath",
                table: "TillReports");

            migrationBuilder.DropColumn(
                name: "ContentType",
                table: "TillReports");

            migrationBuilder.DropColumn(
                name: "OriginalFileName",
                table: "TillReports");

            migrationBuilder.AddColumn<int>(
                name: "ReportType",
                table: "TillReports",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<Guid>(
                name: "ShiftId",
                table: "TillReports",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "TillReportAttachments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TillReportId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PageNumber = table.Column<int>(type: "int", nullable: false),
                    StoredPath = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    OriginalFileName = table.Column<string>(type: "nvarchar(260)", maxLength: 260, nullable: false),
                    ContentType = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TillReportAttachments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TillReportAttachments_TillReports_TillReportId",
                        column: x => x.TillReportId,
                        principalTable: "TillReports",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_TillReports_ShiftId",
                table: "TillReports",
                column: "ShiftId");

            migrationBuilder.CreateIndex(
                name: "IX_TillReportAttachments_TillReportId",
                table: "TillReportAttachments",
                column: "TillReportId");

            migrationBuilder.AddForeignKey(
                name: "FK_TillReports_Shifts_ShiftId",
                table: "TillReports",
                column: "ShiftId",
                principalTable: "Shifts",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_TillReports_Shifts_ShiftId",
                table: "TillReports");

            migrationBuilder.DropTable(
                name: "TillReportAttachments");

            migrationBuilder.DropIndex(
                name: "IX_TillReports_ShiftId",
                table: "TillReports");

            migrationBuilder.DropColumn(
                name: "ReportType",
                table: "TillReports");

            migrationBuilder.DropColumn(
                name: "ShiftId",
                table: "TillReports");

            migrationBuilder.AddColumn<string>(
                name: "AttachmentPath",
                table: "TillReports",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ContentType",
                table: "TillReports",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "OriginalFileName",
                table: "TillReports",
                type: "nvarchar(260)",
                maxLength: 260,
                nullable: false,
                defaultValue: "");
        }
    }
}
