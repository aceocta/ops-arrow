using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Configurations;
using ScratchCard.Domain.Constants;

namespace ScratchCard.Api.Controllers;

[Route("api/configurations")]
[Authorize]
public class ConfigurationsController : BaseApiController
{
    private readonly IConfigurationService _configurationService;

    public ConfigurationsController(IConfigurationService configurationService)
    {
        _configurationService = configurationService;
    }

    /// <summary>
    /// Reads remain available to all operational roles (cashiers need flags like
    /// EnableMobileCameraBarcodeScanning), but the service additionally enforces that the
    /// caller is a member of the requested shop.
    /// </summary>
    [HttpGet]
    [Authorize(Roles = RoleNames.OperationalRoles)]
    public async Task<IActionResult> Get([FromQuery] Guid? shopId, CancellationToken cancellationToken)
    {
        var result = await _configurationService.GetAsync(shopId, cancellationToken);
        return Success(result);
    }

    /// <summary>
    /// Writes are management-only (defense in depth: the service also enforces shop membership
    /// and restricts global writes to PlatformAdmin).
    /// </summary>
    [HttpPut]
    [Authorize(Roles = RoleNames.ManagementAndAbove)]
    public async Task<IActionResult> Update([FromBody] UpdateConfigurationRequest request, CancellationToken cancellationToken)
    {
        await _configurationService.UpdateAsync(request, cancellationToken);
        return Success(new { Updated = true });
    }
}

