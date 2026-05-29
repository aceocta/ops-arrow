using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Admin;
using ScratchCard.Domain.Constants;

namespace ScratchCard.Api.Controllers;

/// <summary>
/// PlatformAdmin-only management of customers (Companies) across the whole platform. Backs the
/// admin web app; gated to the PlatformAdmin role.
/// </summary>
[Route("api/admin/customers")]
[Authorize(Roles = RoleNames.PlatformAdmin)]
public class AdminCustomersController : BaseApiController
{
    private readonly IAdminCustomerService _adminCustomerService;

    public AdminCustomersController(IAdminCustomerService adminCustomerService)
    {
        _adminCustomerService = adminCustomerService;
    }

    /// <summary>Paged, searchable list of all customers. ?search= matches company name or email.</summary>
    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] string? search,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken cancellationToken = default)
    {
        var result = await _adminCustomerService.ListCustomersAsync(search, page, pageSize, cancellationToken);
        return Success(result);
    }

    /// <summary>Full detail for one customer: company fields + shops + users + subscription rollup.</summary>
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken cancellationToken)
    {
        var result = await _adminCustomerService.GetCustomerAsync(id, cancellationToken);
        return Success(result);
    }

    /// <summary>Edit a customer's company details (name, contact, address, active state).</summary>
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] AdminUpdateCustomerRequest request, CancellationToken cancellationToken)
    {
        var result = await _adminCustomerService.UpdateCustomerAsync(id, request, cancellationToken);
        return Success(result);
    }

    [HttpPost("{id:guid}/suspend")]
    public async Task<IActionResult> Suspend(Guid id, CancellationToken cancellationToken)
    {
        var result = await _adminCustomerService.SetCustomerStatusAsync(id, false, cancellationToken);
        return Success(result);
    }

    [HttpPost("{id:guid}/activate")]
    public async Task<IActionResult> Activate(Guid id, CancellationToken cancellationToken)
    {
        var result = await _adminCustomerService.SetCustomerStatusAsync(id, true, cancellationToken);
        return Success(result);
    }
}
