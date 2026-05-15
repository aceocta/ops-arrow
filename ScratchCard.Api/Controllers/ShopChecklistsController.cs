using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Checklists;
using ScratchCard.Domain.Constants;

namespace ScratchCard.Api.Controllers;

[Route("api/shop-checklists")]
[Authorize(Roles = $"{RoleNames.PlatformAdmin},{RoleNames.ShopOwner},{RoleNames.Manager},{RoleNames.Cashier}")]
public class ShopChecklistsController : BaseApiController
{
    private readonly IShopChecklistService _shopChecklistService;

    public ShopChecklistsController(IShopChecklistService shopChecklistService)
    {
        _shopChecklistService = shopChecklistService;
    }

    [HttpGet("config")]
    public async Task<IActionResult> ListConfiguration([FromQuery] Guid shopId, CancellationToken cancellationToken)
    {
        var result = await _shopChecklistService.ListConfigurationAsync(shopId, cancellationToken);
        return Success(result);
    }

    [HttpPost("groups")]
    [Authorize(Roles = $"{RoleNames.PlatformAdmin},{RoleNames.ShopOwner},{RoleNames.Manager}")]
    public async Task<IActionResult> CreateGroup([FromBody] CreateShopChecklistGroupRequest request, CancellationToken cancellationToken)
    {
        var result = await _shopChecklistService.CreateGroupAsync(request, cancellationToken);
        return Success(result);
    }

    [HttpPut("groups/{id:guid}")]
    [Authorize(Roles = $"{RoleNames.PlatformAdmin},{RoleNames.ShopOwner},{RoleNames.Manager}")]
    public async Task<IActionResult> UpdateGroup(Guid id, [FromBody] UpdateShopChecklistGroupRequest request, CancellationToken cancellationToken)
    {
        var result = await _shopChecklistService.UpdateGroupAsync(id, request, cancellationToken);
        return Success(result);
    }

    [HttpPost("groups/reorder")]
    [Authorize(Roles = $"{RoleNames.PlatformAdmin},{RoleNames.ShopOwner},{RoleNames.Manager}")]
    public async Task<IActionResult> ReorderGroups([FromBody] ReorderChecklistGroupsRequest request, CancellationToken cancellationToken)
    {
        await _shopChecklistService.ReorderGroupsAsync(request, cancellationToken);
        return Success(true, "Checklist groups reordered.");
    }

    [HttpPost("tasks")]
    [Authorize(Roles = $"{RoleNames.PlatformAdmin},{RoleNames.ShopOwner},{RoleNames.Manager}")]
    public async Task<IActionResult> CreateTask([FromBody] CreateShopChecklistTaskRequest request, CancellationToken cancellationToken)
    {
        var result = await _shopChecklistService.CreateTaskAsync(request, cancellationToken);
        return Success(result);
    }

    [HttpPut("tasks/{id:guid}")]
    [Authorize(Roles = $"{RoleNames.PlatformAdmin},{RoleNames.ShopOwner},{RoleNames.Manager}")]
    public async Task<IActionResult> UpdateTask(Guid id, [FromBody] UpdateShopChecklistTaskRequest request, CancellationToken cancellationToken)
    {
        var result = await _shopChecklistService.UpdateTaskAsync(id, request, cancellationToken);
        return Success(result);
    }

    [HttpPost("tasks/reorder")]
    [Authorize(Roles = $"{RoleNames.PlatformAdmin},{RoleNames.ShopOwner},{RoleNames.Manager}")]
    public async Task<IActionResult> ReorderTasks([FromBody] ReorderChecklistTasksRequest request, CancellationToken cancellationToken)
    {
        await _shopChecklistService.ReorderTasksAsync(request, cancellationToken);
        return Success(true, "Checklist tasks reordered.");
    }

    [HttpGet("daily")]
    public async Task<IActionResult> GetDailyChecklist(
        [FromQuery] Guid shopId,
        [FromQuery] DateOnly date,
        [FromQuery] Guid? shiftId,
        CancellationToken cancellationToken)
    {
        var result = await _shopChecklistService.GetDailyChecklistAsync(shopId, date, shiftId, cancellationToken);
        return Success(result);
    }

    [HttpPost("daily/completion")]
    public async Task<IActionResult> UpsertTaskCompletion([FromBody] UpsertChecklistTaskCompletionRequest request, CancellationToken cancellationToken)
    {
        var result = await _shopChecklistService.UpsertTaskCompletionAsync(request, cancellationToken);
        return Success(result);
    }

    [HttpPost("daily/sync-offline")]
    public async Task<IActionResult> SyncOfflineCompletions([FromBody] SyncOfflineChecklistCompletionsRequest request, CancellationToken cancellationToken)
    {
        var result = await _shopChecklistService.SyncOfflineCompletionsAsync(request, cancellationToken);
        return Success(result);
    }

    [HttpGet("history")]
    [Authorize(Roles = $"{RoleNames.PlatformAdmin},{RoleNames.ShopOwner},{RoleNames.Manager}")]
    public async Task<IActionResult> History(
        [FromQuery] Guid shopId,
        [FromQuery] DateOnly from,
        [FromQuery] DateOnly to,
        CancellationToken cancellationToken)
    {
        var result = await _shopChecklistService.GetCompletionHistoryAsync(shopId, from, to, cancellationToken);
        return Success(result);
    }
}

