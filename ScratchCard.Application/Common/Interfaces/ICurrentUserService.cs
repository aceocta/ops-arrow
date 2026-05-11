namespace ScratchCard.Application.Common.Interfaces;

public interface ICurrentUserService
{
    Guid? UserId { get; }
    string Email { get; }
    string FirstName { get; }
    string LastName { get; }
    string FullName { get; }
    IReadOnlyCollection<string> Roles { get; }
    string? IpAddress { get; }
    bool IsInRole(string role);
}
