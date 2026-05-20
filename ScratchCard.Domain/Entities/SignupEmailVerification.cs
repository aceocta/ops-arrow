using ScratchCard.Domain.Common;

namespace ScratchCard.Domain.Entities;

public class SignupEmailVerification : AuditableEntity
{
    public string Email { get; set; } = string.Empty;
    public string CodeHash { get; set; } = string.Empty;
    public int CodeLength { get; set; } = 6;
    public DateTimeOffset ExpiresOn { get; set; }
    public int FailedAttempts { get; set; }
    public DateTimeOffset LastSentOn { get; set; }
}
