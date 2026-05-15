using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ScratchCard.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddedChecklist : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ShopChecklistGroups",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    GroupName = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    DisplayOrder = table.Column<int>(type: "int", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false, defaultValue: true),
                    IsSystemDefault = table.Column<bool>(type: "bit", nullable: false, defaultValue: false),
                    IsDeleted = table.Column<bool>(type: "bit", nullable: false, defaultValue: false),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ShopChecklistGroups", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ShopChecklistGroups_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "ShopChecklistTasks",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ChecklistGroupId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TaskName = table.Column<string>(type: "nvarchar(180)", maxLength: 180, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(800)", maxLength: 800, nullable: true),
                    DisplayOrder = table.Column<int>(type: "int", nullable: false),
                    IsRequired = table.Column<bool>(type: "bit", nullable: false, defaultValue: true),
                    IsActive = table.Column<bool>(type: "bit", nullable: false, defaultValue: true),
                    NotesRequiredOnComplete = table.Column<bool>(type: "bit", nullable: false, defaultValue: false),
                    RequiredForShopOpen = table.Column<bool>(type: "bit", nullable: false, defaultValue: false),
                    RequiredForShiftClose = table.Column<bool>(type: "bit", nullable: false, defaultValue: false),
                    RequiredForDayClose = table.Column<bool>(type: "bit", nullable: false, defaultValue: false),
                    IsSystemDefault = table.Column<bool>(type: "bit", nullable: false, defaultValue: false),
                    IsDeleted = table.Column<bool>(type: "bit", nullable: false, defaultValue: false),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ShopChecklistTasks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ShopChecklistTasks_ShopChecklistGroups_ChecklistGroupId",
                        column: x => x.ChecklistGroupId,
                        principalTable: "ShopChecklistGroups",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_ShopChecklistTasks_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "ShopChecklistTaskCompletions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ShopId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    BusinessDate = table.Column<DateOnly>(type: "date", nullable: false),
                    ShiftId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ChecklistGroupId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ChecklistTaskId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    IsCompleted = table.Column<bool>(type: "bit", nullable: false, defaultValue: false),
                    CompletedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CompletedByName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    CompletedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    Notes = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    CreatedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ModifiedOn = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ModifiedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ShopChecklistTaskCompletions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ShopChecklistTaskCompletions_Companies_CompanyId",
                        column: x => x.CompanyId,
                        principalTable: "Companies",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_ShopChecklistTaskCompletions_Shifts_ShiftId",
                        column: x => x.ShiftId,
                        principalTable: "Shifts",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_ShopChecklistTaskCompletions_ShopChecklistGroups_ChecklistGroupId",
                        column: x => x.ChecklistGroupId,
                        principalTable: "ShopChecklistGroups",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_ShopChecklistTaskCompletions_ShopChecklistTasks_ChecklistTaskId",
                        column: x => x.ChecklistTaskId,
                        principalTable: "ShopChecklistTasks",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_ShopChecklistTaskCompletions_Shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "Shops",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_ShopChecklistGroups_ShopId_DisplayOrder",
                table: "ShopChecklistGroups",
                columns: new[] { "ShopId", "DisplayOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_ShopChecklistGroups_ShopId_GroupName_IsDeleted",
                table: "ShopChecklistGroups",
                columns: new[] { "ShopId", "GroupName", "IsDeleted" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ShopChecklistGroups_ShopId_IsDeleted",
                table: "ShopChecklistGroups",
                columns: new[] { "ShopId", "IsDeleted" });

            migrationBuilder.CreateIndex(
                name: "IX_ShopChecklistTaskCompletions_ChecklistGroupId_ChecklistTaskId",
                table: "ShopChecklistTaskCompletions",
                columns: new[] { "ChecklistGroupId", "ChecklistTaskId" });

            migrationBuilder.CreateIndex(
                name: "IX_ShopChecklistTaskCompletions_ChecklistTaskId",
                table: "ShopChecklistTaskCompletions",
                column: "ChecklistTaskId");

            migrationBuilder.CreateIndex(
                name: "IX_ShopChecklistTaskCompletions_CompanyId",
                table: "ShopChecklistTaskCompletions",
                column: "CompanyId");

            migrationBuilder.CreateIndex(
                name: "IX_ShopChecklistTaskCompletions_ShiftId",
                table: "ShopChecklistTaskCompletions",
                column: "ShiftId");

            migrationBuilder.CreateIndex(
                name: "IX_ShopChecklistTaskCompletions_ShopId_BusinessDate",
                table: "ShopChecklistTaskCompletions",
                columns: new[] { "ShopId", "BusinessDate" });

            migrationBuilder.CreateIndex(
                name: "IX_ShopChecklistTaskCompletions_ShopId_BusinessDate_ChecklistTaskId",
                table: "ShopChecklistTaskCompletions",
                columns: new[] { "ShopId", "BusinessDate", "ChecklistTaskId" },
                unique: true,
                filter: "[ShiftId] IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_ShopChecklistTaskCompletions_ShopId_BusinessDate_ShiftId_ChecklistTaskId",
                table: "ShopChecklistTaskCompletions",
                columns: new[] { "ShopId", "BusinessDate", "ShiftId", "ChecklistTaskId" },
                unique: true,
                filter: "[ShiftId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_ShopChecklistTasks_ChecklistGroupId_DisplayOrder",
                table: "ShopChecklistTasks",
                columns: new[] { "ChecklistGroupId", "DisplayOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_ShopChecklistTasks_ChecklistGroupId_TaskName_IsDeleted",
                table: "ShopChecklistTasks",
                columns: new[] { "ChecklistGroupId", "TaskName", "IsDeleted" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ShopChecklistTasks_ShopId_IsDeleted",
                table: "ShopChecklistTasks",
                columns: new[] { "ShopId", "IsDeleted" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ShopChecklistTaskCompletions");

            migrationBuilder.DropTable(
                name: "ShopChecklistTasks");

            migrationBuilder.DropTable(
                name: "ShopChecklistGroups");
        }
    }
}
