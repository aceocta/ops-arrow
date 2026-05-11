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

    [HttpGet("me")]
    [Authorize]
    public async Task<IActionResult> Me(CancellationToken cancellationToken)
    {
        var profile = await _authService.GetCurrentUserProfileAsync(cancellationToken);
        return Success(profile);
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
