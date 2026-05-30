using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ScratchCard.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddVisitorsLog : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsFuelStation",
                table: "Shops",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "Visitors",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    FullName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Organisation = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    Phone = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: true),
                    DefaultVisitType = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: true),
                    VisitCount = table.Column<int>(type: "int", nullable: false),
                    LastVisitedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Visitors", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Visitors_Companies_CompanyId",
                        column: x => x.CompanyId,
                        principalTable: "Companies",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "VisitorLogEntries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    VisitorId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    SequenceNo = table.Column<int>(type: "int", nullable: false),
                    VisitDate = table.Column<DateOnly>(type: "date", nullable: false),
                    TimeIn = table.Column<TimeOnly>(type: "time", nullable: false),
                    TimeOut = table.Column<TimeOnly>(type: "time", nullable: true),
                    VisitorName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Organisation = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    VisitType = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Purpose = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    HostName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    VehicleRegistration = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: true),
                    IsInspector = table.Column<bool>(type: "bit", nullable: false),
                    SignatureImagePath = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    PhotoImagePath = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    Notes = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    SpaPassportRef = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    PermitToWorkRef = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    InductionAcknowledged = table.Column<bool>(type: "bit", nullable: false),
                    RecordedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    RecordedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    RecordedByName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_VisitorLogEntries", x => x.Id);
                    table.ForeignKey(
                        name: "FK_VisitorLogEntries_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_VisitorLogEntries_Visitors_VisitorId",
                        column: x => x.VisitorId,
                        principalTable: "Visitors",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_VisitorLogEntries_ShopId_TimeOut",
                table: "VisitorLogEntries",
                columns: new[] { "ShopId", "TimeOut" });

            migrationBuilder.CreateIndex(
                name: "IX_VisitorLogEntries_ShopId_VisitDate",
                table: "VisitorLogEntries",
                columns: new[] { "ShopId", "VisitDate" });

            migrationBuilder.CreateIndex(
                name: "IX_VisitorLogEntries_ShopId_VisitDate_SequenceNo",
                table: "VisitorLogEntries",
                columns: new[] { "ShopId", "VisitDate", "SequenceNo" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_VisitorLogEntries_VisitorId",
                table: "VisitorLogEntries",
                column: "VisitorId");

            migrationBuilder.CreateIndex(
                name: "IX_Visitors_CompanyId_FullName",
                table: "Visitors",
                columns: new[] { "CompanyId", "FullName" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "VisitorLogEntries");

            migrationBuilder.DropTable(
                name: "Visitors");

            migrationBuilder.DropColumn(
                name: "IsFuelStation",
                table: "Shops");
        }
    }
}
