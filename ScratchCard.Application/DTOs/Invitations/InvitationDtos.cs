using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.DTOs.Invitations;

public class CreateInvitationRequest
{
    public Guid ShopId { get; set; }
    public string Email { get; set; } = string.Empty;
    public Guid RoleId { get; set; }
    public int ExpiryHours { get; set; } = 72;
}

public class InvitationDto
{
    public Guid Id { get; set; }
    public Guid ShopId { get; set; }
    public string Email { get; set; } = string.Empty;
    public Guid RoleId { get; set; }
    public string RoleName { get; set; } = string.Empty;
    public InvitationStatus Status { get; set; }
    public DateTimeOffset ExpiresOn { get; set; }
    public DateTimeOffset? AcceptedOn { get; set; }
    public DateTimeOffset? CancelledOn { get; set; }
}

public class ValidateInvitationResponse
{
    public bool IsValid { get; set; }
    public string Email { get; set; } = string.Empty;
    public Guid ShopId { get; set; }
    public string RoleName { get; set; } = string.Empty;
    public DateTimeOffset ExpiresOn { get; set; }
}

public class AcceptInvitationRequest
{
    public string Token { get; set; } = string.Empty;
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
}
