using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.ComplianceChecks;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Api.Controllers;

[Route("api/compliance-checks")]
[Authorize(Roles = $"{RoleNames.PlatformAdmin},{RoleNames.ShopOwner},{RoleNames.Manager},{RoleNames.Cashier},{RoleNames.SalesAssistant}")]
public class ComplianceChecksController : BaseApiController
{
    private readonly IComplianceCheckService _complianceCheckService;

    public ComplianceChecksController(IComplianceCheckService complianceCheckService)
    {
        _complianceCheckService = complianceCheckService;
    }

    [HttpGet("config")]
    public async Task<IActionResult> ListConfiguration(
        [FromQuery] Guid shopId,
        [FromQuery] ComplianceCheckFrequency? frequency,
        CancellationToken cancellationToken)
    {
        var result = await _complianceCheckService.ListConfigurationAsync(shopId, frequency, cancellationToken);
        return Success(result);
    }

    [HttpPost("groups")]
    [Authorize(Roles = $"{RoleNames.PlatformAdmin},{RoleNames.ShopOwner},{RoleNames.Manager}")]
    public async Task<IActionResult> CreateGroup([FromBody] CreateComplianceCheckGroupRequest request, CancellationToken cancellationToken)
    {
        var result = await _complianceCheckService.CreateGroupAsync(request, cancellationToken);
        return Success(result);
    }

    [HttpPut("groups/{id:guid}")]
    [Authorize(Roles = $"{RoleNames.PlatformAdmin},{RoleNames.ShopOwner},{RoleNames.Manager}")]
    public async Task<IActionResult> UpdateGroup(Guid id, [FromBody] UpdateComplianceCheckGroupRequest request, CancellationToken cancellationToken)
    {
        var result = await _complianceCheckService.UpdateGroupAsync(id, request, cancellationToken);
        return Success(result);
    }

    [HttpPost("groups/reorder")]
    [Authorize(Roles = $"{RoleNames.PlatformAdmin},{RoleNames.ShopOwner},{RoleNames.Manager}")]
    public async Task<IActionResult> ReorderGroups([FromBody] ReorderComplianceCheckGroupsRequest request, CancellationToken cancellationToken)
    {
        await _complianceCheckService.ReorderGroupsAsync(request, cancellationToken);
        return Success(true, "Compliance check groups reordered.");
    }

    [HttpGet("items")]
    public async Task<IActionResult> ListItems(
        [FromQuery] Guid shopId,
        [FromQuery] ComplianceCheckFrequency? frequency,
        CancellationToken cancellationToken)
    {
        var result = await _complianceCheckService.ListItemsAsync(shopId, frequency, cancellationToken);
        return Success(result);
    }

    [HttpPost("items")]
    [Authorize(Roles = $"{RoleNames.PlatformAdmin},{RoleNames.ShopOwner},{RoleNames.Manager}")]
    public async Task<IActionResult> CreateItem([FromBody] CreateComplianceCheckItemRequest request, CancellationToken cancellationToken)
    {
        var result = await _complianceCheckService.CreateItemAsync(request, cancellationToken);
        return Success(result);
    }

    [HttpPut("items/{id:guid}")]
    [Authorize(Roles = $"{RoleNames.PlatformAdmin},{RoleNames.ShopOwner},{RoleNames.Manager}")]
    public async Task<IActionResult> UpdateItem(Guid id, [FromBody] UpdateComplianceCheckItemRequest request, CancellationToken cancellationToken)
    {
        var result = await _complianceCheckService.UpdateItemAsync(id, request, cancellationToken);
        return Success(result);
    }

    [HttpPost("items/reorder")]
    [Authorize(Roles = $"{RoleNames.PlatformAdmin},{RoleNames.ShopOwner},{RoleNames.Manager}")]
    public async Task<IActionResult> ReorderItems([FromBody] ReorderComplianceCheckItemsRequest request, CancellationToken cancellationToken)
    {
        await _complianceCheckService.ReorderItemsAsync(request, cancellationToken);
        return Success(true, "Compliance check items reordered.");
    }

    [HttpGet("period-log")]
    public async Task<IActionResult> PeriodLog(
        [FromQuery] Guid shopId,
        [FromQuery] ComplianceCheckFrequency frequency,
        [FromQuery] DateOnly date,
        CancellationToken cancellationToken)
    {
        var result = await _complianceCheckService.GetPeriodLogAsync(shopId, frequency, date, cancellationToken);
        return Success(result);
    }

    [HttpPost("entries")]
    public async Task<IActionResult> UpsertEntry([FromBody] UpsertComplianceCheckEntryRequest request, CancellationToken cancellationToken)
    {
        var result = await _complianceCheckService.UpsertEntryAsync(request, cancellationToken);
        return Success(result);
    }

    [HttpPost("entries/close-action")]
    [Authorize(Roles = $"{RoleNames.PlatformAdmin},{RoleNames.ShopOwner},{RoleNames.Manager}")]
    public async Task<IActionResult> CloseAction([FromBody] CloseOutComplianceActionRequest request, CancellationToken cancellationToken)
    {
        var result = await _complianceCheckService.CloseActionAsync(request, cancellationToken);
        return Success(result);
    }

    [HttpGet("attachments/{attachmentId:guid}/content")]
    public async Task<IActionResult> GetAttachmentContent(Guid attachmentId, CancellationToken cancellationToken)
    {
        var result = await _complianceCheckService.GetAttachmentDataUrlAsync(attachmentId, cancellationToken);
        return Success(result);
    }

    [HttpGet("actions")]
    [Authorize(Roles = $"{RoleNames.PlatformAdmin},{RoleNames.ShopOwner},{RoleNames.Manager}")]
    public async Task<IActionResult> ActionReport(
        [FromQuery] Guid shopId,
        [FromQuery] DateOnly from,
        [FromQuery] DateOnly to,
        [FromQuery] bool openOnly,
        CancellationToken cancellationToken)
    {
        var result = await _complianceCheckService.GetActionReportAsync(shopId, from, to, openOnly, cancellationToken);
        return Success(result);
    }
}
