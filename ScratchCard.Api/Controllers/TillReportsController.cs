using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Api.Authorization;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.StoreSales;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Api.Controllers;

[Route("api/till-reports")]
[Authorize(Roles = RoleNames.OperationalRoles)]
public class TillReportsController : BaseApiController
{
    private readonly ITillReportService _tillReportService;

    public TillReportsController(ITillReportService tillReportService)
    {
        _tillReportService = tillReportService;
    }

    [HttpPost("parse")]
    [Authorize(Roles = RoleNames.OwnerAndManager)]
    [RequireShopRole(RoleNames.CompanyOwner, RoleNames.Manager)]
    [RequestSizeLimit(40 * 1024 * 1024)]
    public async Task<IActionResult> Parse([FromForm] ParseTillReportFormRequest request, CancellationToken cancellationToken)
    {
        if (request.ShopId == Guid.Empty)
        {
            throw new AppException("validation_failed", "Shop is required.");
        }

        var files = request.Files ?? [];
        if (files.Count == 0)
        {
            throw new AppException(ErrorCodes.TillReportImageRequired, "At least one till report photo is required.");
        }

        var tillFiles = new List<TillReportFile>();
        foreach (var file in files)
        {
            if (file is null || file.Length == 0)
            {
                continue;
            }

            var contentType = file.ContentType ?? string.Empty;
            var isImage = contentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase);
            var isPdf = contentType.Equals("application/pdf", StringComparison.OrdinalIgnoreCase);
            if (!isImage && !isPdf)
            {
                throw new AppException(ErrorCodes.InvalidFileType, "Only image or PDF files are supported for till reports.");
            }

            await using var stream = file.OpenReadStream();
            using var buffer = new MemoryStream();
            await stream.CopyToAsync(buffer, cancellationToken);

            tillFiles.Add(new TillReportFile
            {
                Bytes = buffer.ToArray(),
                ContentType = string.IsNullOrWhiteSpace(contentType) ? "image/jpeg" : contentType,
                FileName = string.IsNullOrWhiteSpace(file.FileName) ? "till-report.jpg" : file.FileName
            });
        }

        if (tillFiles.Count == 0)
        {
            throw new AppException(ErrorCodes.TillReportImageRequired, "At least one till report photo is required.");
        }

        var result = await _tillReportService.ProcessAsync(new ProcessTillReportRequest
        {
            ShopId = request.ShopId,
            ReportType = request.ReportType,
            ShiftId = request.ShiftId,
            BusinessDayId = request.BusinessDayId,
            Files = tillFiles
        }, cancellationToken);

        return Success(result);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken cancellationToken)
    {
        var result = await _tillReportService.GetAsync(id, cancellationToken);
        return Success(result);
    }

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] Guid shopId,
        [FromQuery] DateOnly? from,
        [FromQuery] DateOnly? to,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50,
        CancellationToken cancellationToken = default)
    {
        var result = await _tillReportService.ListAsync(shopId, from, to, page, pageSize, cancellationToken);
        return Success(result);
    }

    [HttpPost("{id:guid}/lines/{lineId:guid}/classify")]
    [Authorize(Roles = RoleNames.OwnerAndManager)]
    public async Task<IActionResult> ClassifyLine(Guid id, Guid lineId, [FromBody] ReclassifyLineRequest request, CancellationToken cancellationToken)
    {
        var result = await _tillReportService.ReclassifyLineAsync(id, lineId, request.Classification, cancellationToken);
        return Success(result);
    }

    [HttpPost("{id:guid}/confirm")]
    [Authorize(Roles = RoleNames.OwnerAndManager)]
    public async Task<IActionResult> Confirm(Guid id, CancellationToken cancellationToken)
    {
        var result = await _tillReportService.ConfirmAsync(id, cancellationToken);
        return Success(result);
    }

    [HttpPost("{id:guid}/payments")]
    [Authorize(Roles = RoleNames.OwnerAndManager)]
    public async Task<IActionResult> UpsertPayment(Guid id, [FromBody] UpsertTillPaymentRequest request, CancellationToken cancellationToken)
    {
        var result = await _tillReportService.UpsertPaymentAsync(id, request.PaymentType, request.Amount, cancellationToken);
        return Success(result);
    }

    [HttpGet("payments/summary")]
    public async Task<IActionResult> PaymentSummary([FromQuery] Guid shopId, [FromQuery] Guid businessDayId, CancellationToken cancellationToken)
    {
        var result = await _tillReportService.GetPaymentSummaryAsync(shopId, businessDayId, cancellationToken);
        return Success(result);
    }

    [HttpGet("rules")]
    public async Task<IActionResult> ListRules([FromQuery] Guid shopId, CancellationToken cancellationToken)
    {
        var result = await _tillReportService.ListRulesAsync(shopId, cancellationToken);
        return Success(result);
    }

    [HttpPost("rules")]
    [Authorize(Roles = RoleNames.OwnerAndManager)]
    [RequireShopRole(RoleNames.CompanyOwner, RoleNames.Manager)]
    public async Task<IActionResult> CreateRule([FromBody] CreateTillRuleRequest request, CancellationToken cancellationToken)
    {
        var result = await _tillReportService.CreateRuleAsync(request, cancellationToken);
        return Success(result);
    }

    [HttpDelete("rules/{ruleId:guid}")]
    [Authorize(Roles = RoleNames.OwnerAndManager)]
    public async Task<IActionResult> DeleteRule(Guid ruleId, CancellationToken cancellationToken)
    {
        await _tillReportService.DeleteRuleAsync(ruleId, cancellationToken);
        return Success(new { ruleId });
    }
}

public class ParseTillReportFormRequest
{
    public Guid ShopId { get; set; }
    public TillReportType ReportType { get; set; } = TillReportType.DayEnd;
    public Guid? ShiftId { get; set; }
    public Guid? BusinessDayId { get; set; }
    public List<IFormFile>? Files { get; set; }
}
