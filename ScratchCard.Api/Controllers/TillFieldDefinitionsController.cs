using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.DTOs.StoreSales;
using ScratchCard.Domain.Constants;

namespace ScratchCard.Api.Controllers;

// The global, data-driven canonical till-field catalogue. Editing it changes the taxonomy for all
// shops without a code deploy. Platform-admin only.
[Route("api/admin/till-field-definitions")]
[Authorize(Roles = RoleNames.PlatformAdmin)]
public class TillFieldDefinitionsController : BaseApiController
{
    private readonly ITillFieldDefinitionService _service;

    public TillFieldDefinitionsController(ITillFieldDefinitionService service)
    {
        _service = service;
    }

    [HttpGet]
    public async Task<IActionResult> List(CancellationToken cancellationToken)
        => Success(await _service.ListAsync(cancellationToken));

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateTillFieldDefinitionRequest request, CancellationToken cancellationToken)
        => Success(await _service.CreateAsync(request, cancellationToken));

    [HttpPut]
    public async Task<IActionResult> Update([FromBody] UpdateTillFieldDefinitionRequest request, CancellationToken cancellationToken)
        => Success(await _service.UpdateAsync(request, cancellationToken));

    [HttpPost("reload")]
    public async Task<IActionResult> Reload(CancellationToken cancellationToken)
    {
        await _service.ReloadAsync(cancellationToken);
        return Success(true);
    }

    [HttpGet("aliases")]
    public async Task<IActionResult> ListAliases(CancellationToken cancellationToken)
        => Success(await _service.ListAliasesAsync(cancellationToken));

    [HttpPost("aliases")]
    public async Task<IActionResult> AddAlias([FromBody] AddTillFieldAliasRequest request, CancellationToken cancellationToken)
        => Success(await _service.AddAliasAsync(request, cancellationToken));

    [HttpDelete("aliases/{id:guid}")]
    public async Task<IActionResult> DeleteAlias(Guid id, CancellationToken cancellationToken)
    {
        await _service.DeleteAliasAsync(id, cancellationToken);
        return Success(true);
    }
}
