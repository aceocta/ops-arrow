using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.DTOs.CoinPods;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Api.Controllers;

// Coin Pod: per-shop coin bag stock management. Operational roles can view stock, swap notes↔coins
// and view history/alerts; configuration, manual adjustments, bank movements and alert dismissal are
// management-only. Per-shop role + coin_pod feature gates are enforced in the service.
[Route("api/coin-pod")]
[Authorize(Roles = RoleNames.OperationalRoles)]
public class CoinPodController : BaseApiController
{
    private readonly ICoinPodService _service;

    public CoinPodController(ICoinPodService service)
    {
        _service = service;
    }

    [HttpGet("dashboard")]
    public async Task<IActionResult> Dashboard([FromQuery] Guid shopId, CancellationToken cancellationToken)
        => Success(await _service.GetDashboardAsync(shopId, cancellationToken));

    [HttpGet("config")]
    [Authorize(Roles = RoleNames.ManagementAndAbove)]
    public async Task<IActionResult> GetConfig([FromQuery] Guid shopId, CancellationToken cancellationToken)
        => Success(await _service.GetConfigAsync(shopId, cancellationToken));

    [HttpPut("config")]
    [Authorize(Roles = RoleNames.ManagementAndAbove)]
    public async Task<IActionResult> UpdateConfig([FromBody] UpdateCoinBagConfigRequest request, CancellationToken cancellationToken)
        => Success(await _service.UpdateConfigAsync(request, cancellationToken));

    [HttpPost("swaps/notes-to-coins")]
    public async Task<IActionResult> NotesToCoins([FromBody] CoinSwapRequest request, CancellationToken cancellationToken)
        => Success(await _service.SwapNotesToCoinsAsync(request, cancellationToken));

    [HttpPost("swaps/coins-to-notes")]
    public async Task<IActionResult> CoinsToNotes([FromBody] CoinSwapRequest request, CancellationToken cancellationToken)
        => Success(await _service.SwapCoinsToNotesAsync(request, cancellationToken));

    [HttpPost("adjustments")]
    [Authorize(Roles = RoleNames.ManagementAndAbove)]
    public async Task<IActionResult> Adjust([FromBody] CoinManualAdjustmentRequest request, CancellationToken cancellationToken)
        => Success(await _service.AdjustAsync(request, cancellationToken));

    [HttpPost("bank/refill")]
    [Authorize(Roles = RoleNames.ManagementAndAbove)]
    public async Task<IActionResult> BankRefill([FromBody] CoinBankMovementRequest request, CancellationToken cancellationToken)
        => Success(await _service.BankRefillAsync(request, cancellationToken));

    [HttpPost("bank/removal")]
    [Authorize(Roles = RoleNames.ManagementAndAbove)]
    public async Task<IActionResult> BankRemoval([FromBody] CoinBankMovementRequest request, CancellationToken cancellationToken)
        => Success(await _service.BankRemovalAsync(request, cancellationToken));

    [HttpPost("stock-count")]
    public async Task<IActionResult> RecordStockByValue([FromBody] RecordCoinStockRequest request, CancellationToken cancellationToken)
        => Success(await _service.RecordStockByValueAsync(request, cancellationToken));

    [HttpGet("transactions")]
    public async Task<IActionResult> Transactions([FromQuery] Guid shopId, [FromQuery] DateOnly from, [FromQuery] DateOnly to, [FromQuery] Guid? coinDenominationId, CancellationToken cancellationToken)
        => Success(await _service.GetTransactionsAsync(shopId, from, to, coinDenominationId, cancellationToken));

    [HttpPost("transactions/{transactionId:guid}/reverse")]
    [Authorize(Roles = RoleNames.ManagementAndAbove)]
    public async Task<IActionResult> ReverseTransaction(Guid transactionId, [FromBody] CoinReverseTransactionRequest request, CancellationToken cancellationToken)
    {
        request.TransactionId = transactionId;
        return Success(await _service.ReverseTransactionAsync(request, cancellationToken));
    }

    [HttpGet("report")]
    [Authorize(Roles = RoleNames.ManagementAndAbove)]
    public async Task<IActionResult> Report([FromQuery] Guid shopId, [FromQuery] DateOnly from, [FromQuery] DateOnly to, CancellationToken cancellationToken)
        => Success(await _service.GetReportAsync(shopId, from, to, cancellationToken));

    [HttpGet("alerts")]
    public async Task<IActionResult> Alerts([FromQuery] Guid shopId, [FromQuery] CoinBagAlertStatus? status, CancellationToken cancellationToken)
        => Success(await _service.GetAlertsAsync(shopId, status, cancellationToken));

    [HttpPost("alerts/{alertId:guid}/dismiss")]
    [Authorize(Roles = RoleNames.ManagementAndAbove)]
    public async Task<IActionResult> DismissAlert(Guid alertId, [FromQuery] Guid shopId, CancellationToken cancellationToken)
        => Success(await _service.DismissAlertAsync(shopId, alertId, cancellationToken));
}
