using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Subscriptions;
using ScratchCard.Domain.Constants;

namespace ScratchCard.Api.Controllers;

[Route("api/admin/subscription-discount-rules")]
[Authorize(Roles = RoleNames.PlatformAdmin)]
public class AdminSubscriptionDiscountRulesController : BaseApiController
{
    private readonly ISubscriptionService _subscriptionService;

    public AdminSubscriptionDiscountRulesController(ISubscriptionService subscriptionService)
    {
        _subscriptionService = subscriptionService;
    }

    [HttpGet]
    public async Task<IActionResult> List(CancellationToken cancellationToken)
    {
        var result = await _subscriptionService.ListDiscountRulesAsync(cancellationToken);
        return Success(result);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] UpsertSubscriptionDiscountRuleRequest request, CancellationToken cancellationToken)
    {
        var result = await _subscriptionService.CreateDiscountRuleAsync(request, cancellationToken);
        return Success(result);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpsertSubscriptionDiscountRuleRequest request, CancellationToken cancellationToken)
    {
        var result = await _subscriptionService.UpdateDiscountRuleAsync(id, request, cancellationToken);
        return Success(result);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        await _subscriptionService.DeleteDiscountRuleAsync(id, cancellationToken);
        return Success(true);
    }
}
