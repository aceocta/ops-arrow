using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Subscriptions;
using ScratchCard.Domain.Constants;

namespace ScratchCard.Api.Controllers;

[Route("api/admin/features")]
[Authorize(Roles = RoleNames.PlatformAdmin)]
public class AdminFeaturesController : BaseApiController
{
    private readonly IFeatureAdminService _featureAdminService;

    public AdminFeaturesController(IFeatureAdminService featureAdminService)
    {
        _featureAdminService = featureAdminService;
    }

    /// <summary>List the feature catalogue. Pass ?includeInactive=true to see disabled rows.</summary>
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] bool includeInactive, CancellationToken cancellationToken)
    {
        var result = await _featureAdminService.ListAsync(includeInactive, cancellationToken);
        return Success(result);
    }

    /// <summary>Create a new admin-defined feature. System features are seeded from code.</summary>
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] UpsertFeatureRequest request, CancellationToken cancellationToken)
    {
        var result = await _featureAdminService.CreateAsync(request, cancellationToken);
        return Success(result);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpsertFeatureRequest request, CancellationToken cancellationToken)
    {
        var result = await _featureAdminService.UpdateAsync(id, request, cancellationToken);
        return Success(result);
    }

    /// <summary>
    /// Delete a feature. Only admin-defined (non-system) features that are not assigned to any
    /// plan can be deleted; system features should be deactivated instead.
    /// </summary>
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        await _featureAdminService.DeleteAsync(id, cancellationToken);
        return Success(new { ok = true });
    }
}
