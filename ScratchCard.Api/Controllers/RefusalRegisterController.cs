using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.RefusalRegister;
using ScratchCard.Domain.Constants;

namespace ScratchCard.Api.Controllers;

[Route("api/refusal-register")]
[Authorize(Roles = $"{RoleNames.ShopOwner},{RoleNames.Manager},{RoleNames.Cashier}")]
public class RefusalRegisterController : BaseApiController
{
    private readonly IRefusalRegisterService _refusalRegisterService;

    public RefusalRegisterController(IRefusalRegisterService refusalRegisterService)
    {
        _refusalRegisterService = refusalRegisterService;
    }

    [HttpPost("entries")]
    public async Task<IActionResult> CreateEntry([FromBody] CreateRefusalRegisterEntryRequest request, CancellationToken cancellationToken)
    {
        var result = await _refusalRegisterService.CreateEntryAsync(request, cancellationToken);
        return Success(result);
    }

    [HttpGet("entries")]
    public async Task<IActionResult> ListEntries([FromQuery] Guid shopId, [FromQuery] DateOnly date, CancellationToken cancellationToken)
    {
        var result = await _refusalRegisterService.ListEntriesAsync(shopId, date, cancellationToken);
        return Success(result);
    }

    [HttpGet("entries/range")]
    [Authorize(Roles = $"{RoleNames.ShopOwner},{RoleNames.Manager}")]
    public async Task<IActionResult> ListEntriesByRange([FromQuery] Guid shopId, [FromQuery] DateOnly from, [FromQuery] DateOnly to, CancellationToken cancellationToken)
    {
        var result = await _refusalRegisterService.ListEntriesByRangeAsync(shopId, from, to, cancellationToken);
        return Success(result);
    }

    [HttpGet("entries/{id:guid}")]
    public async Task<IActionResult> GetEntry(Guid id, CancellationToken cancellationToken)
    {
        var result = await _refusalRegisterService.GetEntryAsync(id, cancellationToken);
        return Success(result);
    }

    [HttpGet("entries/{id:guid}/signature")]
    public async Task<IActionResult> GetEntrySignature(Guid id, CancellationToken cancellationToken)
    {
        var result = await _refusalRegisterService.GetEntrySignatureDataUrlAsync(id, cancellationToken);
        return Success(result);
    }

    [HttpGet("entries/{id:guid}/review-signature")]
    public async Task<IActionResult> GetEntryReviewSignature(Guid id, CancellationToken cancellationToken)
    {
        var result = await _refusalRegisterService.GetEntryReviewSignatureDataUrlAsync(id, cancellationToken);
        return Success(result);
    }

    [HttpPut("entries/{id:guid}")]
    public async Task<IActionResult> UpdateEntry(Guid id, [FromBody] UpdateRefusalRegisterEntryRequest request, CancellationToken cancellationToken)
    {
        var result = await _refusalRegisterService.UpdateEntryAsync(id, request, cancellationToken);
        return Success(result);
    }

    [HttpPost("entries/{id:guid}/review")]
    [Authorize(Roles = $"{RoleNames.ShopOwner},{RoleNames.Manager}")]
    public async Task<IActionResult> ReviewEntry(Guid id, [FromBody] ReviewRefusalRegisterEntryRequest request, CancellationToken cancellationToken)
    {
        var result = await _refusalRegisterService.ReviewEntryAsync(id, request, cancellationToken);
        return Success(result);
    }

    [HttpPost("entries/review")]
    [Authorize(Roles = $"{RoleNames.ShopOwner},{RoleNames.Manager}")]
    public async Task<IActionResult> ReviewEntries([FromBody] ReviewRefusalRegisterEntriesRequest request, CancellationToken cancellationToken)
    {
        var result = await _refusalRegisterService.ReviewEntriesAsync(request, cancellationToken);
        return Success(result);
    }

    [HttpGet("daily")]
    public async Task<IActionResult> Daily([FromQuery] Guid shopId, [FromQuery] DateOnly date, CancellationToken cancellationToken)
    {
        var result = await _refusalRegisterService.GetDailyLogAsync(shopId, date, cancellationToken);
        return Success(result);
    }

    [HttpPost("signoff")]
    [Authorize(Roles = $"{RoleNames.ShopOwner},{RoleNames.Manager}")]
    public async Task<IActionResult> SignOff([FromBody] SignOffRefusalRegisterDailyRequest request, CancellationToken cancellationToken)
    {
        var result = await _refusalRegisterService.SignOffDailyAsync(request, cancellationToken);
        return Success(result);
    }

    [HttpPost("reopen")]
    [Authorize(Roles = $"{RoleNames.ShopOwner},{RoleNames.Manager}")]
    public async Task<IActionResult> Reopen([FromBody] ReopenRefusalRegisterDailyRequest request, CancellationToken cancellationToken)
    {
        await _refusalRegisterService.ReopenDailyAsync(request, cancellationToken);
        return Success(true, "Daily signoff reopened.");
    }
}
