using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Subscriptions;
using ScratchCard.Domain.Constants;

namespace ScratchCard.Api.Controllers;

[Route("api/admin/subscription-plans")]
[Authorize(Roles = RoleNames.PlatformAdmin)]
public class AdminSubscriptionPlansController : BaseApiController
{
    private readonly ISubscriptionPlanAdminService _planAdminService;

    public AdminSubscriptionPlansController(ISubscriptionPlanAdminService planAdminService)
    {
        _planAdminService = planAdminService;
    }

    /// <summary>
    /// List every subscription plan (active and inactive) with full config — features, limits,
    /// trial days, store product IDs. Use this from any admin tool to see the current catalogue
    /// before editing.
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> List(CancellationToken cancellationToken)
    {
        var result = await _planAdminService.ListAllAsync(cancellationToken);
        return Success(result);
    }

    /// <summary>
    /// Update one plan in place. Send only the fields you want to change — anything omitted (or
    /// null) is left untouched. For MaxUsers / ReportExportsPerMonth, send -1 to set "unlimited".
    /// </summary>
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateSubscriptionPlanRequest request, CancellationToken cancellationToken)
    {
        var result = await _planAdminService.UpdateAsync(id, request, cancellationToken);
        return Success(result);
    }

    /// <summary>
    /// List all features currently attached to a plan, including disabled ones and any per-plan
    /// LimitValue / Notes overrides.
    /// </summary>
    [HttpGet("{id:guid}/features")]
    public async Task<IActionResult> ListFeatures(Guid id, CancellationToken cancellationToken)
    {
        var result = await _planAdminService.ListPlanFeaturesAsync(id, cancellationToken);
        return Success(result);
    }

    /// <summary>
    /// Attach a feature to a plan, or update an existing assignment. Use this for fine-grained
    /// edits (toggling IsEnabled, adjusting LimitValue) without replacing the whole feature set.
    /// </summary>
    [HttpPut("{id:guid}/features")]
    public async Task<IActionResult> UpsertFeature(Guid id, [FromBody] UpsertPlanFeatureRequest request, CancellationToken cancellationToken)
    {
        var result = await _planAdminService.UpsertPlanFeatureAsync(id, request, cancellationToken);
        return Success(result);
    }

    /// <summary>
    /// Replace the entire feature set on a plan in a single call. Any feature not listed in the
    /// payload is removed.
    /// </summary>
    [HttpPost("{id:guid}/features:set")]
    public async Task<IActionResult> SetFeatures(Guid id, [FromBody] SetPlanFeaturesRequest request, CancellationToken cancellationToken)
    {
        var result = await _planAdminService.SetPlanFeaturesAsync(id, request, cancellationToken);
        return Success(result);
    }

    /// <summary>Remove a single feature from a plan.</summary>
    [HttpDelete("{id:guid}/features/{featureId:guid}")]
    public async Task<IActionResult> RemoveFeature(Guid id, Guid featureId, CancellationToken cancellationToken)
    {
        await _planAdminService.RemovePlanFeatureAsync(id, featureId, cancellationToken);
        return Success(new { ok = true });
    }
}
