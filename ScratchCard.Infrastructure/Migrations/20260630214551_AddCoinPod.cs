using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ScratchCard.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddCoinPod : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CoinBagAlertRecipients",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CoinDenominationId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    RoleName = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: true),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CoinBagAlertRecipients", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CoinBagAlertRecipients_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "CoinDenominations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(60)", maxLength: 60, nullable: false),
                    Code = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                    DisplayLabel = table.Column<string>(type: "nvarchar(10)", maxLength: 10, nullable: false),
                    CoinValue = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    SortOrder = table.Column<int>(type: "int", nullable: false),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CoinDenominations", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "CoinBagAlerts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CoinDenominationId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AlertType = table.Column<int>(type: "int", nullable: false),
                    CurrentBagQuantity = table.Column<int>(type: "int", nullable: false),
                    StockAlertLimit = table.Column<int>(type: "int", nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    Message = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    TriggeredOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    TriggeredByTransactionId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ResolvedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ResolvedByTransactionId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    DismissedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    DismissedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CoinBagAlerts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CoinBagAlerts_CoinDenominations_CoinDenominationId",
                        column: x => x.CoinDenominationId,
                        principalTable: "CoinDenominations",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_CoinBagAlerts_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "CoinBagTransactions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TransactionNumber = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    TransactionType = table.Column<int>(type: "int", nullable: false),
                    CoinDenominationId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    BagQuantity = table.Column<int>(type: "int", nullable: false),
                    BagValue = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    TotalCoinValue = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    NoteAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    DifferenceAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Direction = table.Column<int>(type: "int", nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    Comment = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    PerformedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PerformedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CancelledOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CancelledByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CancellationReason = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CoinBagTransactions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CoinBagTransactions_CoinDenominations_CoinDenominationId",
                        column: x => x.CoinDenominationId,
                        principalTable: "CoinDenominations",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_CoinBagTransactions_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "ShopCoinBagConfigs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CoinDenominationId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    BagValue = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    MinBagQuantity = table.Column<int>(type: "int", nullable: false),
                    MaxBagQuantity = table.Column<int>(type: "int", nullable: false),
                    OpeningBagQuantity = table.Column<int>(type: "int", nullable: false),
                    StockAlertLimit = table.Column<int>(type: "int", nullable: false),
                    IsAlertEnabled = table.Column<bool>(type: "bit", nullable: false),
                    AlertRecipientType = table.Column<int>(type: "int", nullable: false),
                    AlertChannel = table.Column<int>(type: "int", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    LastAlertTriggeredOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    LastAlertResolvedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    IsDeleted = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ShopCoinBagConfigs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ShopCoinBagConfigs_CoinDenominations_CoinDenominationId",
                        column: x => x.CoinDenominationId,
                        principalTable: "CoinDenominations",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_ShopCoinBagConfigs_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "ShopCoinBagStocks",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CoinDenominationId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CurrentBagQuantity = table.Column<int>(type: "int", nullable: false),
                    CurrentTotalValue = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    LastUpdatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    LastUpdatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    IsDeleted = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ShopCoinBagStocks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ShopCoinBagStocks_CoinDenominations_CoinDenominationId",
                        column: x => x.CoinDenominationId,
                        principalTable: "CoinDenominations",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_ShopCoinBagStocks_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_CoinBagAlertRecipients_ShopId_CoinDenominationId",
                table: "CoinBagAlertRecipients",
                columns: new[] { "ShopId", "CoinDenominationId" });

            migrationBuilder.CreateIndex(
                name: "IX_CoinBagAlerts_CoinDenominationId",
                table: "CoinBagAlerts",
                column: "CoinDenominationId");

            migrationBuilder.CreateIndex(
                name: "IX_CoinBagAlerts_ShopId_CoinDenominationId_Status",
                table: "CoinBagAlerts",
                columns: new[] { "ShopId", "CoinDenominationId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_CoinBagTransactions_CoinDenominationId",
                table: "CoinBagTransactions",
                column: "CoinDenominationId");

            migrationBuilder.CreateIndex(
                name: "IX_CoinBagTransactions_ShopId_PerformedOn",
                table: "CoinBagTransactions",
                columns: new[] { "ShopId", "PerformedOn" });

            migrationBuilder.CreateIndex(
                name: "IX_CoinBagTransactions_TransactionNumber",
                table: "CoinBagTransactions",
                column: "TransactionNumber");

            migrationBuilder.CreateIndex(
                name: "IX_CoinDenominations_Code",
                table: "CoinDenominations",
                column: "Code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ShopCoinBagConfigs_CoinDenominationId",
                table: "ShopCoinBagConfigs",
                column: "CoinDenominationId");

            migrationBuilder.CreateIndex(
                name: "IX_ShopCoinBagConfigs_ShopId_CoinDenominationId_IsDeleted",
                table: "ShopCoinBagConfigs",
                columns: new[] { "ShopId", "CoinDenominationId", "IsDeleted" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ShopCoinBagStocks_CoinDenominationId",
                table: "ShopCoinBagStocks",
                column: "CoinDenominationId");

            migrationBuilder.CreateIndex(
                name: "IX_ShopCoinBagStocks_ShopId_CoinDenominationId_IsDeleted",
                table: "ShopCoinBagStocks",
                columns: new[] { "ShopId", "CoinDenominationId", "IsDeleted" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CoinBagAlertRecipients");

            migrationBuilder.DropTable(
                name: "CoinBagAlerts");

            migrationBuilder.DropTable(
                name: "CoinBagTransactions");

            migrationBuilder.DropTable(
                name: "ShopCoinBagConfigs");

            migrationBuilder.DropTable(
                name: "ShopCoinBagStocks");

            migrationBuilder.DropTable(
                name: "CoinDenominations");
        }
    }
}
