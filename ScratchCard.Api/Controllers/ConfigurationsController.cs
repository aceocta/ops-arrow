using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Configurations;
using ScratchCard.Domain.Constants;

namespace ScratchCard.Api.Controllers;

[Route("api/configurations")]
[Authorize(Roles = $"{RoleNames.ShopOwner},{RoleNames.Manager},{RoleNames.Cashier}")]
public class ConfigurationsController : BaseApiController
{
    private readonly IConfigurationService _configurationService;

    public ConfigurationsController(IConfigurationService configurationService)
    {
        _configurationService = configurationService;
    }

    [HttpGet]
    public async Task<IActionResult> Get([FromQuery] Guid? shopId, CancellationToken cancellationToken)
    {
        var result = await _configurationService.GetAsync(shopId, cancellationToken);
        return Success(result);
    }

    [HttpPut]
    public async Task<IActionResult> Update([FromBody] UpdateConfigurationRequest request, CancellationToken cancellationToken)
    {
        await _configurationService.UpdateAsync(request, cancellationToken);
        return Success(new { Updated = true });
    }
}
