using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.PrizePayouts;
using ScratchCard.Application.Services;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Entities;

namespace ScratchCard.Api.Controllers;

[Route("api/prize-payouts")]
[Authorize(Roles = RoleNames.OperationalRoles)]
public class PrizePayoutsController : BaseApiController
{
    private readonly IPrizePayoutService _prizePayoutService;
    private readonly IFeatureGateService _featureGateService;
    private readonly IShopMembershipService _shopMembershipService;
    private readonly IRepository<PrizePayout> _payoutRepository;

    public PrizePayoutsController(
        IPrizePayoutService prizePayoutService,
        IFeatureGateService featureGateService,
        IShopMembershipService shopMembershipService,
        IRepository<PrizePayout> payoutRepository)
    {
        _prizePayoutService = prizePayoutService;
        _featureGateService = featureGateService;
        _shopMembershipService = shopMembershipService;
        _payoutRepository = payoutRepository;
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreatePrizePayoutRequest request, CancellationToken cancellationToken)
    {
        var result = await _prizePayoutService.CreateAsync(request, cancellationToken);
        return Success(result);
    }

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] Guid shiftId, CancellationToken cancellationToken)
    {
        var result = await _prizePayoutService.ListAsync(shiftId, cancellationToken);
        return Success(result);
    }

    [HttpPost("{id:guid}/approve")]
    [Authorize(Roles = RoleNames.OwnerAndManager)]
    public async Task<IActionResult> Approve(Guid id, [FromBody] ApprovePrizePayoutRequest request, CancellationToken cancellationToken)
    {
        // The manager approval workflow is a Pro-tier feature. Resolve the shop from the payout
        // since the request body does not carry it.
        var shopId = await _payoutRepository.Query()
            .Where(x => x.Id == id)
            .Select(x => (Guid?)x.ShopId)
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new AppException("prize_payout_not_found", "Prize payout not found.", 404);

        // Per-shop role gate. The class-level [Authorize] only checks the global role claim;
        // this closes the loophole where a Manager at Shop A could approve a payout at Shop B
        // they're only a Cashier at.
        await _shopMembershipService.EnsureCurrentUserShopRoleAsync(
            shopId,
            new[] { RoleNames.CompanyOwner, RoleNames.Manager },
            cancellationToken);

        await _featureGateService.EnsureFeatureAsync(shopId, FeatureKeys.ApprovalWorkflow, cancellationToken);

        var result = await _prizePayoutService.ApproveAsync(id, request, cancellationToken);
        return Success(result);
    }
}

