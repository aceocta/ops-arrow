using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Deliveries;
using ScratchCard.Domain.Constants;

namespace ScratchCard.Api.Controllers;

[Route("api/deliveries")]
[Authorize(Roles = $"{RoleNames.ShopOwner},{RoleNames.Manager},{RoleNames.Cashier}")]
public class DeliveriesController : BaseApiController
{
    private readonly IDeliveryService _deliveryService;

    public DeliveriesController(IDeliveryService deliveryService)
    {
        _deliveryService = deliveryService;
    }

    [HttpPost]
    [Authorize(Roles = $"{RoleNames.ShopOwner},{RoleNames.Manager}")]
    public async Task<IActionResult> Create([FromBody] CreateDeliveryRequest request, CancellationToken cancellationToken)
    {
        var result = await _deliveryService.CreateAsync(request, cancellationToken);
        return Success(result);
    }

    [HttpPost("parse-note")]
    [Authorize(Roles = $"{RoleNames.ShopOwner},{RoleNames.Manager}")]
    [RequestSizeLimit(10 * 1024 * 1024)]
    public async Task<IActionResult> ParseNote([FromForm] ParseDeliveryNoteFormRequest request, CancellationToken cancellationToken)
    {
        if (request.ShopId == Guid.Empty)
        {
            throw new AppException("validation_failed", "Shop is required.");
        }

        if (request.Image is null || request.Image.Length == 0)
        {
            throw new AppException(ErrorCodes.DeliveryNoteImageRequired, "Delivery note image is required.");
        }

        if (!request.Image.ContentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase))
        {
            throw new AppException(ErrorCodes.InvalidFileType, "Only image files are supported for delivery note parsing.");
        }

        await using var stream = request.Image.OpenReadStream();
        using var buffer = new MemoryStream();
        await stream.CopyToAsync(buffer, cancellationToken);

        var result = await _deliveryService.ParseDeliveryNoteAsync(new ParseDeliveryNoteRequest
        {
            ShopId = request.ShopId,
            ImageBytes = buffer.ToArray(),
            ContentType = string.IsNullOrWhiteSpace(request.Image.ContentType) ? "image/jpeg" : request.Image.ContentType,
            FileName = string.IsNullOrWhiteSpace(request.Image.FileName) ? "delivery-note.jpg" : request.Image.FileName
        }, cancellationToken);

        return Success(result);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken cancellationToken)
    {
        var result = await _deliveryService.GetAsync(id, cancellationToken);
        return Success(result);
    }

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] Guid shopId, CancellationToken cancellationToken)
    {
        var result = await _deliveryService.ListAsync(shopId, cancellationToken);
        return Success(result);
    }
}

public class ParseDeliveryNoteFormRequest
{
    public Guid ShopId { get; set; }
    public IFormFile? Image { get; set; }
}
