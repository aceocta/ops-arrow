using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.DTOs.StoreSales;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Api.Controllers;

// Phase 1 till reconciliation: capture canonical lines, count cash, compute over/short, sign off.
[Route("api/till-reconciliation")]
[Authorize(Roles = RoleNames.AllAuthenticated)]
public class TillReconciliationController : BaseApiController
{
    private readonly ITillReconciliationService _service;

    public TillReconciliationController(ITillReconciliationService service)
    {
        _service = service;
    }

    [HttpPost]
    public async Task<IActionResult> GetOrCreate([FromBody] GetOrCreateReconciliationRequest request, CancellationToken cancellationToken)
        => Success(await _service.GetOrCreateAsync(request, cancellationToken));

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken cancellationToken)
        => Success(await _service.GetAsync(id, cancellationToken));

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] Guid shopId, [FromQuery] DateOnly from, [FromQuery] DateOnly to, CancellationToken cancellationToken)
        => Success(await _service.ListAsync(shopId, from, to, cancellationToken));

    [HttpPost("lines")]
    public async Task<IActionResult> SaveLine([FromBody] SaveReconciliationLineRequest request, CancellationToken cancellationToken)
        => Success(await _service.SaveLineAsync(request, cancellationToken));

    [HttpDelete("lines/{lineId:guid}")]
    public async Task<IActionResult> DeleteLine(Guid lineId, CancellationToken cancellationToken)
        => Success(await _service.DeleteLineAsync(lineId, cancellationToken));

    [HttpPost("lines/{lineId:guid}/restore")]
    public async Task<IActionResult> RestoreLine(Guid lineId, CancellationToken cancellationToken)
        => Success(await _service.RestoreLineAsync(lineId, cancellationToken));

    [HttpPost("cash-count")]
    public async Task<IActionResult> SetCashCount([FromBody] SetCashCountRequest request, CancellationToken cancellationToken)
        => Success(await _service.SetCashCountAsync(request, cancellationToken));

    [HttpPost("variance-reason")]
    public async Task<IActionResult> SetVarianceReason([FromBody] SetVarianceReasonRequest request, CancellationToken cancellationToken)
        => Success(await _service.SetVarianceReasonAsync(request, cancellationToken));

    [HttpPost("{id:guid}/status")]
    public async Task<IActionResult> SetStatus(Guid id, [FromQuery] TillReconciliationStatus status, CancellationToken cancellationToken)
        => Success(await _service.SetStatusAsync(id, status, cancellationToken));

    // Undo a photo upload — removes the photo and the lines it produced.
    [HttpDelete("attachments/{attachmentId:guid}")]
    public async Task<IActionResult> DeleteAttachment(Guid attachmentId, CancellationToken cancellationToken)
        => Success(await _service.DeleteAttachmentAsync(attachmentId, cancellationToken));

    // Reopen an approved (locked) reconciliation back to editable. Management only.
    [HttpPost("{id:guid}/reopen")]
    public async Task<IActionResult> Reopen(Guid id, CancellationToken cancellationToken)
        => Success(await _service.ReopenAsync(id, cancellationToken));

    // Erase a reconciliation entirely. Management only.
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        await _service.DeleteAsync(id, cancellationToken);
        return Success(true);
    }

    [HttpPost("{id:guid}/ingest-photo")]
    [RequestSizeLimit(20_000_000)]
    public async Task<IActionResult> IngestPhoto(Guid id, IFormFile file, [FromForm] string? sourceLabel, CancellationToken cancellationToken)
    {
        if (file is null || file.Length == 0)
        {
            return BadRequest(new { code = "no_file", message = "An image file is required." });
        }
        using var ms = new MemoryStream();
        await file.CopyToAsync(ms, cancellationToken);
        var result = await _service.IngestPhotoAsync(
            id, ms.ToArray(), file.ContentType ?? "application/octet-stream", file.FileName, sourceLabel, cancellationToken);
        return Success(result);
    }

    [HttpGet("rollup")]
    public async Task<IActionResult> Rollup([FromQuery] Guid shopId, [FromQuery] DateOnly date, CancellationToken cancellationToken)
        => Success(await _service.GetRollupAsync(shopId, date, cancellationToken));

    [HttpGet("analytics")]
    public async Task<IActionResult> Analytics([FromQuery] Guid shopId, [FromQuery] DateOnly from, [FromQuery] DateOnly to, CancellationToken cancellationToken)
        => Success(await _service.GetAnalyticsAsync(shopId, from, to, cancellationToken));

    [HttpGet("attachments/{attachmentId:guid}/content")]
    public async Task<IActionResult> AttachmentContent(Guid attachmentId, CancellationToken cancellationToken)
        => Success(await _service.GetAttachmentContentAsync(attachmentId, cancellationToken));
}
