using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using ScratchCard.Application.Common.Interfaces;

namespace ScratchCard.Infrastructure.Authentication;

public class CurrentUserService : ICurrentUserService
{
    private readonly IHttpContextAccessor _httpContextAccessor;

    public CurrentUserService(IHttpContextAccessor httpContextAccessor)
    {
        _httpContextAccessor = httpContextAccessor;
    }

    public Guid? UserId
    {
        get
        {
            var subject = _httpContextAccessor.HttpContext?.User.FindFirstValue(ClaimTypes.NameIdentifier)
                ?? _httpContextAccessor.HttpContext?.User.FindFirstValue("sub");

            return Guid.TryParse(subject, out var id) ? id : null;
        }
    }

    public string Email =>
        _httpContextAccessor.HttpContext?.User.FindFirstValue(ClaimTypes.Email)
        ?? _httpContextAccessor.HttpContext?.User.FindFirstValue("email")
        ?? string.Empty;

    public string FirstName =>
        _httpContextAccessor.HttpContext?.User.FindFirstValue(ClaimTypes.GivenName)
        ?? _httpContextAccessor.HttpContext?.User.FindFirstValue("given_name")
        ?? string.Empty;

    public string LastName =>
        _httpContextAccessor.HttpContext?.User.FindFirstValue(ClaimTypes.Surname)
        ?? _httpContextAccessor.HttpContext?.User.FindFirstValue("family_name")
        ?? string.Empty;

    public string FullName =>
        BuildDisplayName(
            FirstName,
            LastName,
            _httpContextAccessor.HttpContext?.User.FindFirstValue(ClaimTypes.Name)
                ?? _httpContextAccessor.HttpContext?.User.FindFirstValue("name")
                ?? string.Empty);

    public IReadOnlyCollection<string> Roles =>
        _httpContextAccessor.HttpContext?.User.FindAll(ClaimTypes.Role).Select(x => x.Value).ToArray()
        ?? [];

    public string? IpAddress => _httpContextAccessor.HttpContext?.Connection.RemoteIpAddress?.ToString();

    public bool IsInRole(string role) =>
        _httpContextAccessor.HttpContext?.User.IsInRole(role) ?? false;

    private static string BuildDisplayName(string? firstName, string? lastName, string fallback)
    {
        var displayName = $"{firstName} {lastName}".Trim();
        return string.IsNullOrWhiteSpace(displayName) ? fallback : displayName;
    }
}
