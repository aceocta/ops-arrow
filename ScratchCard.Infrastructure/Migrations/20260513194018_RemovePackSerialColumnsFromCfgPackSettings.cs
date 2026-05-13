using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ScratchCard.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class RemovePackSerialColumnsFromCfgPackSettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DefaultEndSerialNumber",
                table: "CfgPackSettings");

            migrationBuilder.DropColumn(
                name: "DefaultStartSerialNumber",
                table: "CfgPackSettings");

            migrationBuilder.DropColumn(
                name: "SerialNumberLength",
                table: "CfgPackSettings");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "DefaultEndSerialNumber",
                table: "CfgPackSettings",
                type: "nvarchar(30)",
                maxLength: 30,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DefaultStartSerialNumber",
                table: "CfgPackSettings",
                type: "nvarchar(30)",
                maxLength: 30,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "SerialNumberLength",
                table: "CfgPackSettings",
                type: "int",
                nullable: true);
        }
    }
}
