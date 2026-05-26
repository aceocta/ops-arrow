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
}
