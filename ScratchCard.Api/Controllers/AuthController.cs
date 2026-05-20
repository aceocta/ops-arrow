using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Auth;

namespace ScratchCard.Api.Controllers;

[Route("api/auth")]
public class AuthController : BaseApiController
{
    private readonly IAuthService _authService;
    private readonly IConfiguration _configuration;

    public AuthController(IAuthService authService, IConfiguration configuration)
    {
        _authService = authService;
        _configuration = configuration;
    }

    [HttpPost("signup")]
    [AllowAnonymous]
    public async Task<IActionResult> Signup([FromBody] PasswordSignupRequest request, CancellationToken cancellationToken)
    {
        var token = await _authService.SignUpWithPasswordAsync(request, cancellationToken);
        return Success(token);
    }

    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<IActionResult> Login([FromBody] PasswordLoginRequest request, CancellationToken cancellationToken)
    {
        var token = await _authService.SignInWithPasswordAsync(request, cancellationToken);
        return Success(token);
    }

    [HttpPost("dev-login")]
    [AllowAnonymous]
    public async Task<IActionResult> DevLogin([FromBody] DevLoginRequest? request, CancellationToken cancellationToken)
    {
        var enabled = _configuration.GetValue<bool>("DevAuth:EnableBypassLogin");
        if (!enabled)
        {
            throw new AppException("dev_login_disabled", "Dev login is disabled.", 403);
        }

        request ??= new DevLoginRequest();

        if (string.IsNullOrWhiteSpace(request.Email))
        {
            request.Email = _configuration["DevAuth:DefaultEmail"] ?? string.Empty;
        }

        if (string.IsNullOrWhiteSpace(request.FirstName) && string.IsNullOrWhiteSpace(request.LastName))
        {
            request.FirstName = _configuration["DevAuth:DefaultFirstName"];
            request.LastName = _configuration["DevAuth:DefaultLastName"];

            if (string.IsNullOrWhiteSpace(request.FirstName) && string.IsNullOrWhiteSpace(request.LastName))
            {
                var defaultFullName = _configuration["DevAuth:DefaultFullName"];
                var (firstName, lastName) = ParseName(defaultFullName);
                request.FirstName = firstName;
                request.LastName = lastName;
            }
        }

        if (string.IsNullOrWhiteSpace(request.Role))
        {
            request.Role = _configuration["DevAuth:DefaultRole"] ?? "ShopOwner";
        }

        var token = await _authService.SignInDevAsync(request, cancellationToken);
        return Success(token);
    }

    [HttpPost("forgot-password")]
    [AllowAnonymous]
    public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordRequest request, CancellationToken cancellationToken)
    {
        await _authService.RequestPasswordResetAsync(request, cancellationToken);
        return Success(new { }, "If the account exists, a password reset email has been sent.");
    }

    [HttpGet("reset-password")]
    [AllowAnonymous]
    public IActionResult ResetPasswordLink([FromQuery] string token)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            return BadRequest("Reset token is required.");
        }

        var encodedToken = Uri.EscapeDataString(token.Trim());
        var deepLink = $"scratchcard://reset-password?token={encodedToken}";
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
                <p>We are opening the app to reset your password. If it does not open, use the buttons below.</p>
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

    [HttpPost("reset-password")]
    [AllowAnonymous]
    public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordRequest request, CancellationToken cancellationToken)
    {
        await _authService.ResetPasswordAsync(request, cancellationToken);
        return Success(new { }, "Password has been reset successfully.");
    }

    [HttpGet("me")]
    [Authorize]
    public async Task<IActionResult> Me(CancellationToken cancellationToken)
    {
        var profile = await _authService.GetCurrentUserProfileAsync(cancellationToken);
        return Success(profile);
    }

    [HttpPost("refresh")]
    [Authorize]
    public async Task<IActionResult> Refresh(CancellationToken cancellationToken)
    {
        var token = await _authService.RefreshTokenAsync(cancellationToken);
        return Success(token);
    }

    private static (string? FirstName, string? LastName) ParseName(string? fullName)
    {
        if (string.IsNullOrWhiteSpace(fullName))
        {
            return (null, null);
        }

        var trimmed = fullName.Trim();
        var firstSpace = trimmed.IndexOf(' ');
        if (firstSpace < 0)
        {
            return (trimmed, null);
        }

        var firstName = trimmed[..firstSpace].Trim();
        var lastName = trimmed[(firstSpace + 1)..].Trim();
        return (firstName, lastName);
    }
}
