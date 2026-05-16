using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Invitations;
using ScratchCard.Domain.Constants;

namespace ScratchCard.Api.Controllers;

[Route("api/invitations")]
public class InvitationsController : BaseApiController
{
    private readonly IInvitationService _invitationService;

    public InvitationsController(IInvitationService invitationService)
    {
        _invitationService = invitationService;
    }

    [HttpPost]
    [Authorize(Roles = $"{RoleNames.PlatformAdmin},{RoleNames.ShopOwner},{RoleNames.Manager}")]
    public async Task<IActionResult> Send([FromBody] CreateInvitationRequest request, CancellationToken cancellationToken)
    {
        var invitation = await _invitationService.SendInvitationAsync(request, cancellationToken);
        return Success(invitation);
    }

    [HttpGet("validate")]
    [AllowAnonymous]
    public async Task<IActionResult> Validate([FromQuery] string token, CancellationToken cancellationToken)
    {
        var result = await _invitationService.ValidateInvitationAsync(token, cancellationToken);
        return Success(result);
    }

    [HttpGet("accept")]
    [AllowAnonymous]
    public IActionResult AcceptLink([FromQuery] string token)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            return BadRequest("Invitation token is required.");
        }

        var encodedToken = Uri.EscapeDataString(token.Trim());
        var deepLink = $"scratchcard://invitation/accept?token={encodedToken}";
        const string androidStoreUrl = "https://play.google.com/store/apps/details?id=com.aceocta.opsarrow";
        const string iosStoreUrl = "https://apps.apple.com/us/search?term=Ops%20Arrow";
        const string desktopFallbackUrl = "https://opsarrow.co.uk";

        var html = """
            <!doctype html>
            <html lang="en">
            <head>
              <meta charset="utf-8" />
              <meta name="viewport" content="width=device-width, initial-scale=1" />
              <title>Open Ops Arrow</title>
              <style>
                body { font-family: Arial, sans-serif; margin: 0; padding: 32px 20px; color: #0b1e24; background: #f4f7fb; }
                .card { max-width: 520px; margin: 0 auto; background: white; border: 1px solid #d9e1e4; border-radius: 14px; padding: 20px; }
                h1 { margin: 0 0 10px; font-size: 22px; }
                p { margin: 0 0 14px; line-height: 1.5; color: #3e5962; }
                a.button { display: inline-block; padding: 12px 16px; border-radius: 10px; text-decoration: none; border: 1px solid #0f3d3e; color: #0f3d3e; font-weight: 600; }
                a.button + a.button { margin-left: 8px; }
              </style>
            </head>
            <body>
              <div class="card">
                <h1>Open Ops Arrow</h1>
                <p>We are opening the app to complete your invitation. If it does not open, use the buttons below.</p>
                <a class="button" href="__DEEP_LINK__">Open App</a>
                <a class="button" id="storeLink" href="__ANDROID_STORE_URL__">Get App</a>
              </div>
              <script>
                (function() {
                  var deepLink = "__DEEP_LINK__";
                  var androidStore = "__ANDROID_STORE_URL__";
                  var iosStore = "__IOS_STORE_URL__";
                  var desktopFallback = "__DESKTOP_FALLBACK_URL__";
                  var ua = navigator.userAgent || "";
                  var isAndroid = /Android/i.test(ua);
                  var isIos = /iPhone|iPad|iPod/i.test(ua);
                  var fallbackUrl = isAndroid ? androidStore : (isIos ? iosStore : desktopFallback);

                  var storeLink = document.getElementById("storeLink");
                  if (storeLink) {
                    storeLink.href = fallbackUrl;
                  }

                  setTimeout(function() {
                    window.location.replace(fallbackUrl);
                  }, 1500);

                  window.location.replace(deepLink);
                })();
              </script>
            </body>
            </html>
            """
            .Replace("__DEEP_LINK__", deepLink, StringComparison.Ordinal)
            .Replace("__ANDROID_STORE_URL__", androidStoreUrl, StringComparison.Ordinal)
            .Replace("__IOS_STORE_URL__", iosStoreUrl, StringComparison.Ordinal)
            .Replace("__DESKTOP_FALLBACK_URL__", desktopFallbackUrl, StringComparison.Ordinal);

        return Content(html, "text/html; charset=utf-8");
    }

    [HttpPost("accept")]
    [AllowAnonymous]
    public async Task<IActionResult> Accept([FromBody] AcceptInvitationRequest request, CancellationToken cancellationToken)
    {
        var result = await _invitationService.AcceptInvitationAsync(request, cancellationToken);
        return Success(result);
    }

    [HttpPost("{invitationId:guid}/resend")]
    [Authorize(Roles = RoleNames.ShopOwner)]
    public async Task<IActionResult> Resend(Guid invitationId, CancellationToken cancellationToken)
    {
        var invitation = await _invitationService.ResendInvitationAsync(invitationId, cancellationToken);
        return Success(invitation);
    }

    [HttpDelete("{invitationId:guid}")]
    [Authorize(Roles = RoleNames.ShopOwner)]
    public async Task<IActionResult> Cancel(Guid invitationId, CancellationToken cancellationToken)
    {
        await _invitationService.CancelInvitationAsync(invitationId, cancellationToken);
        return Success(new { Cancelled = true });
    }

    [HttpGet]
    [Authorize(Roles = $"{RoleNames.PlatformAdmin},{RoleNames.ShopOwner},{RoleNames.Manager}")]
    public async Task<IActionResult> List([FromQuery] Guid shopId, CancellationToken cancellationToken)
    {
        var invitations = await _invitationService.ListInvitationsAsync(shopId, cancellationToken);
        return Success(invitations);
    }
}
