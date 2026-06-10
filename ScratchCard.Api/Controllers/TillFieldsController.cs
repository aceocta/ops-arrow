using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Application.Common.Interfaces;

namespace ScratchCard.Api.Controllers;

// Active canonical fields for line-editor pickers (built-in + custom). Any authenticated user.
[Route("api/till-fields")]
[Authorize]
public class TillFieldsController : BaseApiController
{
    private readonly ITillFieldDefinitionService _service;

    public TillFieldsController(ITillFieldDefinitionService service)
    {
        _service = service;
    }

    [HttpGet]
    public async Task<IActionResult> List(CancellationToken cancellationToken)
        => Success(await _service.ListActiveAsync(cancellationToken));
}
