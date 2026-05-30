using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Api.Authorization;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.VisitorLog;
using ScratchCard.Domain.Constants;

namespace ScratchCard.Api.Controllers;

[Route("api/visitor-log")]
[Authorize(Roles = RoleNames.OperationalRoles)]
public class VisitorLogController : BaseApiController
{
    private readonly IVisitorLogService _visitorLogService;

    public VisitorLogController(IVisitorLogService visitorLogService)
    {
        _visitorLogService = visitorLogService;
    }

    [HttpPost("entries")]
    [RequireFeature(FeatureKeys.VisitorLogBasic)]
    public async Task<IActionResult> CreateEntry([FromBody] CreateVisitorLogEntryRequest request, CancellationToken cancellationToken)
    {
        var result = await _visitorLogService.CreateEntryAsync(request, cancellationToken);
        return Success(result);
    }

    [HttpGet("entries")]
    [RequireFeature(FeatureKeys.VisitorLogBasic)]
    public async Task<IActionResult> ListEntries([FromQuery] Guid shopId, [FromQuery] DateOnly date, CancellationToken cancellationToken)
    {
        var result = await _visitorLogService.ListEntriesAsync(shopId, date, cancellationToken);
        return Success(result);
    }

    [HttpGet("entries/range")]
    [RequireFeature(FeatureKeys.VisitorLogReports)]
    public async Task<IActionResult> ListEntriesByRange([FromQuery] Guid shopId, [FromQuery] DateOnly from, [FromQuery] DateOnly to, CancellationToken cancellationToken)
    {
        var result = await _visitorLogService.ListEntriesByRangeAsync(shopId, from, to, cancellationToken);
        return Success(result);
    }

    [HttpGet("on-site")]
    [RequireFeature(FeatureKeys.VisitorLogBasic)]
    public async Task<IActionResult> OnSite([FromQuery] Guid shopId, CancellationToken cancellationToken)
    {
        var result = await _visitorLogService.ListOnSiteAsync(shopId, cancellationToken);
        return Success(result);
    }

    [HttpGet("daily")]
    [RequireFeature(FeatureKeys.VisitorLogBasic)]
    public async Task<IActionResult> Daily([FromQuery] Guid shopId, [FromQuery] DateOnly date, CancellationToken cancellationToken)
    {
        var result = await _visitorLogService.GetDailyLogAsync(shopId, date, cancellationToken);
        return Success(result);
    }

    [HttpGet("directory")]
    [RequireFeature(FeatureKeys.VisitorLogBasic)]
    public async Task<IActionResult> Directory([FromQuery] Guid shopId, [FromQuery] string query, CancellationToken cancellationToken)
    {
        var result = await _visitorLogService.SearchDirectoryAsync(shopId, query ?? string.Empty, cancellationToken);
        return Success(result);
    }

    /// <summary>Type-ahead over the shared platform organisation directory (consistent company names).</summary>
    [HttpGet("organisations")]
    [RequireFeature(FeatureKeys.VisitorLogBasic)]
    public async Task<IActionResult> Organisations([FromQuery] Guid shopId, [FromQuery] string query, CancellationToken cancellationToken)
    {
        var result = await _visitorLogService.SearchOrganisationsAsync(query ?? string.Empty, cancellationToken);
        return Success(result);
    }

    [HttpGet("entries/{id:guid}")]
    public async Task<IActionResult> GetEntry(Guid id, CancellationToken cancellationToken)
    {
        var result = await _visitorLogService.GetEntryAsync(id, cancellationToken);
        return Success(result);
    }

    [HttpGet("entries/{id:guid}/signature")]
    public async Task<IActionResult> GetEntrySignature(Guid id, CancellationToken cancellationToken)
    {
        var result = await _visitorLogService.GetEntrySignatureDataUrlAsync(id, cancellationToken);
        return Success(result);
    }

    [HttpGet("entries/{id:guid}/photo")]
    public async Task<IActionResult> GetEntryPhoto(Guid id, CancellationToken cancellationToken)
    {
        var result = await _visitorLogService.GetEntryPhotoDataUrlAsync(id, cancellationToken);
        return Success(result);
    }

    [HttpPut("entries/{id:guid}")]
    public async Task<IActionResult> UpdateEntry(Guid id, [FromBody] UpdateVisitorLogEntryRequest request, CancellationToken cancellationToken)
    {
        var result = await _visitorLogService.UpdateEntryAsync(id, request, cancellationToken);
        return Success(result);
    }

    [HttpPost("entries/{id:guid}/sign-out")]
    public async Task<IActionResult> SignOut(Guid id, CancellationToken cancellationToken)
    {
        var result = await _visitorLogService.SignOutAsync(id, cancellationToken);
        return Success(result);
    }
}
